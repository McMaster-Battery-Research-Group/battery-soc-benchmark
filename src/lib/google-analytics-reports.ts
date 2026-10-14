import { createSign } from "crypto";
import { readFile } from "fs/promises";

/**
 * Read-only access to the Google Analytics 4 property for Admin → Analytics.
 *
 * Authentication is a Google service account (a robot account) that has been added to the GA
 * property as a Viewer. Its JSON key lives on the web host only (GOOGLE_ANALYTICS_SERVICE_ACCOUNT_FILE,
 * e.g. /etc/socbench/ga-service-account.json, root:socbench 0640). The key signs a short-lived
 * JWT that Google exchanges for a one-hour access token; no library is needed for that.
 *
 * Reports are fetched through the GA4 Data API (analyticsdata.googleapis.com, v1beta) and cached in
 * memory for 10 minutes so an admin refreshing the page does not spend the property's daily quota.
 */

// overridable so a local mock can stand in for Google during tests
const DATA_API = process.env.GOOGLE_ANALYTICS_DATA_API_URL ?? "https://analyticsdata.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const SUMMARY_TTL_MS = 10 * 60 * 1000;
const REALTIME_TTL_MS = 60 * 1000;

export type Totals = { activeUsers: number; newUsers: number; sessions: number; pageViews: number; engagementRate: number; avgSessionSeconds: number };
export type AnalyticsSummary = {
  propertyId: string;
  fetchedAt: Date;
  last7: Totals;
  last28: Totals;
  /** one row per calendar day, oldest first (28 days) */
  daily: { date: string; activeUsers: number; pageViews: number }[];
  topPages: { path: string; pageViews: number; activeUsers: number }[];
  channels: { channel: string; sessions: number }[];
  countries: { country: string; activeUsers: number }[];
  devices: { device: string; activeUsers: number }[];
  events: { name: string; count: number }[];
};

export function analyticsReportsConfigured() {
  return Boolean(process.env.GOOGLE_ANALYTICS_PROPERTY_ID && process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_FILE);
}

// ---------------------------------------------------------------------------------------------
// auth

type ServiceAccountKey = { client_email: string; private_key: string; token_uri?: string };
let tokenCache: { token: string; expiresAt: number } | null = null;

function b64url(s: string) {
  return Buffer.from(s).toString("base64url");
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const file = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_FILE!;
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read the service-account key at ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!key.client_email || !key.private_key) throw new Error(`the file at ${file} is not a Google service-account key (client_email / private_key missing)`);
  const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google refused the service-account sign-in: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`);
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

// ---------------------------------------------------------------------------------------------
// reports

type Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
type ReportResponse = { rows?: Row[]; error?: { message?: string; status?: string } };

async function run(kind: "runReport" | "runRealtimeReport", body: object): Promise<Row[]> {
  const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID!;
  const res = await fetch(`${DATA_API}/properties/${encodeURIComponent(propertyId)}:${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as ReportResponse;
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 403) throw new Error(`Google Analytics refused the request (${msg}). Check that the service account was added to property ${propertyId} as a Viewer and that the "Google Analytics Data API" is enabled in its Google Cloud project.`);
    throw new Error(`Google Analytics report failed: ${msg}`);
  }
  return json.rows ?? [];
}

const num = (r: Row, i: number) => Number(r.metricValues?.[i]?.value ?? 0);
const dim = (r: Row, i: number) => r.dimensionValues?.[i]?.value ?? "";
const range = (days: number) => ({ startDate: `${days}daysAgo`, endDate: "today" });
const TOTAL_METRICS = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration"].map((name) => ({ name }));
const totals = (r: Row | undefined): Totals => ({
  activeUsers: r ? num(r, 0) : 0,
  newUsers: r ? num(r, 1) : 0,
  sessions: r ? num(r, 2) : 0,
  pageViews: r ? num(r, 3) : 0,
  engagementRate: r ? num(r, 4) : 0,
  avgSessionSeconds: r ? num(r, 5) : 0,
});

let summaryCache: { value: AnalyticsSummary; at: number } | null = null;
let realtimeCache: { value: number; at: number } | null = null;

/** Everything the Admin → Analytics page shows, cached for 10 minutes. Throws with a readable message. */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  if (summaryCache && Date.now() - summaryCache.at < SUMMARY_TTL_MS) return summaryCache.value;
  const [totalRows, dailyRows, pageRows, channelRows, countryRows, deviceRows, eventRows] = await Promise.all([
    // two date ranges in one request: rows come back tagged date_range_0 (7 d) and date_range_1 (28 d)
    run("runReport", { dateRanges: [range(7), range(28)], metrics: TOTAL_METRICS }),
    run("runReport", { dateRanges: [range(28)], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 40 }),
    run("runReport", { dateRanges: [range(28)], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 12 }),
    run("runReport", { dateRanges: [range(28)], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 8 }),
    run("runReport", { dateRanges: [range(28)], dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 8 }),
    run("runReport", { dateRanges: [range(28)], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 5 }),
    run("runReport", { dateRanges: [range(28)], dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 20 }),
  ]);
  const byRange = (tag: string) => totalRows.find((r) => dim(r, 0) === tag);
  const value: AnalyticsSummary = {
    propertyId: process.env.GOOGLE_ANALYTICS_PROPERTY_ID!,
    fetchedAt: new Date(),
    last7: totals(byRange("date_range_0")),
    last28: totals(byRange("date_range_1")),
    daily: dailyRows.map((r) => ({ date: dim(r, 0), activeUsers: num(r, 0), pageViews: num(r, 1) })),
    topPages: pageRows.map((r) => ({ path: dim(r, 0), pageViews: num(r, 0), activeUsers: num(r, 1) })),
    channels: channelRows.map((r) => ({ channel: dim(r, 0), sessions: num(r, 0) })),
    countries: countryRows.map((r) => ({ country: dim(r, 0), activeUsers: num(r, 0) })),
    devices: deviceRows.map((r) => ({ device: dim(r, 0), activeUsers: num(r, 0) })),
    events: eventRows.map((r) => ({ name: dim(r, 0), count: num(r, 0) })),
  };
  summaryCache = { value, at: Date.now() };
  return value;
}

/** People on the site in the last 30 minutes (GA realtime), cached for a minute. Returns null when the call fails. */
export async function getActiveUsersNow(): Promise<number | null> {
  if (realtimeCache && Date.now() - realtimeCache.at < REALTIME_TTL_MS) return realtimeCache.value;
  try {
    const rows = await run("runRealtimeReport", { metrics: [{ name: "activeUsers" }] });
    const value = rows.length ? num(rows[0], 0) : 0;
    realtimeCache = { value, at: Date.now() };
    return value;
  } catch {
    return null;
  }
}
