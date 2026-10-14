import { ExternalLink } from "lucide-react";
import { Stat, Alert } from "@/components/ui/misc";
import { analyticsReportsConfigured, getAnalyticsSummary, getActiveUsersNow, type AnalyticsSummary } from "@/lib/google-analytics-reports";
import { fmtDateTime } from "@/lib/utils";
import { DailyUsersChart } from "./daily-chart";

export const dynamic = "force-dynamic";

/** What the event names in Google Analytics mean on this site. */
const EVENT_LABELS: Record<string, string> = {
  page_view: "Page viewed",
  session_start: "Visit started",
  first_visit: "First-ever visit",
  user_engagement: "Stayed on a page (10 s or more)",
  scroll: "Scrolled to the bottom of a page",
  click: "Outbound click (GA built-in)",
  file_download: "File downloaded",
  form_start: "Started filling in a form",
  form_submit: "Form submitted",
  link_click: "Link clicked (ours)",
  button_click: "Tracked button clicked (ours)",
  signed_in_visit: "Visit by a signed-in person (ours)",
  evaluation_outcome: "Evaluation finished, reported by the worker (ours)",
};

const CHANNEL_HINTS: Record<string, string> = {
  Direct: "typed the address or used a bookmark",
  "Organic Search": "found the site through a search engine",
  Referral: "followed a link from another site",
  "Organic Social": "came from a social network",
  Email: "clicked a link in an e-mail",
  Unassigned: "source unknown",
};

const n = (v: number) => v.toLocaleString("en-CA");
const pct = (v: number) => `${Math.round(v * 100)} %`;
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);

export default async function AnalyticsPage() {
  const measurementId = process.env.GOOGLE_ANALYTICS_ID;
  if (!analyticsReportsConfigured()) return <Shell measurementId={measurementId}><SetupGuide measurementId={measurementId} /></Shell>;

  let summary: AnalyticsSummary;
  try {
    summary = await getAnalyticsSummary();
  } catch (e) {
    return (
      <Shell measurementId={measurementId}>
        <Alert variant="danger" className="mt-5" title="Google Analytics could not be read">
          <p>{e instanceof Error ? e.message : String(e)}</p>
          <p className="mt-2 text-grey-700">The site itself is unaffected; only this page depends on the reporting API. The settings are <code className="rounded bg-grey-100 px-1">GOOGLE_ANALYTICS_PROPERTY_ID</code> and <code className="rounded bg-grey-100 px-1">GOOGLE_ANALYTICS_SERVICE_ACCOUNT_FILE</code> in the web host&apos;s environment file.</p>
        </Alert>
      </Shell>
    );
  }
  const now = await getActiveUsersNow();
  const s = summary;

  return (
    <Shell measurementId={measurementId} fetchedAt={s.fetchedAt}>
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="People, last 28 days" value={n(s.last28.activeUsers)} sub={`${n(s.last7.activeUsers)} in the last 7 days · ${n(s.last28.newUsers)} new`} />
        <Stat label="Visits, last 28 days" value={n(s.last28.sessions)} sub={`${n(s.last7.sessions)} in the last 7 days · ${dur(s.last28.avgSessionSeconds)} on average`} />
        <Stat label="Page views, last 28 days" value={n(s.last28.pageViews)} sub={`${n(s.last7.pageViews)} in the last 7 days · ${pct(s.last28.engagementRate)} of visits engaged`} />
        <Stat label="On the site right now" value={now === null ? "—" : n(now)} sub={now === null ? "realtime report unavailable" : "active in the last 30 minutes"} />
      </div>

      <div className="mt-6">
        <DailyUsersChart daily={s.daily} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RankTable title="Most-viewed pages" description="Page views in the last 28 days, with how many distinct people viewed each." rows={s.topPages.map((p) => ({ label: p.path, value: p.pageViews, sub: `${n(p.activeUsers)} people` }))} unit="views" />
        <RankTable title="How people arrived" description="Visits in the last 28 days by Google's channel grouping." rows={s.channels.map((c) => ({ label: c.channel, value: c.sessions, sub: CHANNEL_HINTS[c.channel] }))} unit="visits" />
        <RankTable title="Countries" description="Distinct people in the last 28 days." rows={s.countries.map((c) => ({ label: c.country, value: c.activeUsers }))} unit="people" />
        <RankTable title="Devices" description="Distinct people in the last 28 days by device type." rows={s.devices.map((d) => ({ label: d.device, value: d.activeUsers }))} unit="people" />
        <RankTable className="lg:col-span-2" title="Events" description="Everything the site reported in the last 28 days. Rows marked “ours” are the custom events this site sends; the rest are Google's built-in ones. Page views are also the first tile above." rows={s.events.map((e) => ({ label: e.name, value: e.count, sub: EVENT_LABELS[e.name] }))} unit="events" mono />
      </div>
    </Shell>
  );
}

function Shell({ children, measurementId, fetchedAt }: { children: React.ReactNode; measurementId?: string; fetchedAt?: Date }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-grey-700">
            How the public site is used, from Google Analytics{measurementId ? <> (property <span className="font-mono text-xs">{measurementId}</span>)</> : null}. Numbers refresh every 10 minutes{fetchedAt ? <>; these were fetched {fmtDateTime(fetchedAt)}</> : null}. Nothing here identifies a person.
          </p>
        </div>
        <a href="https://analytics.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-brand border border-border bg-white px-3 py-1.5 font-heading text-sm font-medium text-grey-800 hover:bg-grey-100">
          Open Google Analytics <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      {children}
    </div>
  );
}

function RankTable({ title, description, rows, unit, mono, className }: { title: string; description: string; rows: { label: string; value: number; sub?: string }[]; unit: string; mono?: boolean; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className={`card ${className ?? ""}`}>
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-heading text-[0.9375rem] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-grey-700">{description}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-grey-600">Nothing recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-b-0">
                <td className="px-5 py-2.5 align-top">
                  <div className={mono ? "font-mono text-xs text-ink" : "font-heading font-medium text-ink"}>{r.label}</div>
                  {r.sub ? <div className="text-xs text-grey-600">{r.sub}</div> : null}
                  {/* proportion bar: a visual aid only, the number beside it is the value */}
                  <div className="mt-1.5 h-1 w-full max-w-xs rounded-full bg-grey-100" aria-hidden><div className="h-1 rounded-full bg-maroon-500" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
                </td>
                <td className="whitespace-nowrap px-5 py-2.5 text-right align-top font-heading font-semibold text-ink tabular">{n(r.value)} <span className="font-normal text-grey-600">{unit}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SetupGuide({ measurementId }: { measurementId?: string }) {
  return (
    <Alert variant="info" className="mt-5" title="Not connected to Google Analytics yet">
      <p>
        {measurementId ? <>The site is sending data to property <span className="font-mono text-xs">{measurementId}</span>, but this page cannot read it back until it has a reporting credential. </> : <>The site is not sending data to Google Analytics (no <code className="rounded bg-grey-100 px-1">GOOGLE_ANALYTICS_ID</code> on the web host). </>}
        Reading reports needs a Google service account, a robot account that can only view the property. One-time setup, about ten minutes:
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-maroon underline">Google Cloud Console</a>, create or pick a project, then under APIs &amp; Services enable the <strong>Google Analytics Data API</strong>.</li>
        <li>Under IAM &amp; Admin → Service accounts, create a service account (any name, no roles needed), open it, and under Keys add a new JSON key. A file downloads.</li>
        <li>In <a href="https://analytics.google.com/" target="_blank" rel="noreferrer" className="text-maroon underline">Google Analytics</a> → Admin → Property access management, add the service account&apos;s e-mail address (it ends in <span className="font-mono text-xs">.iam.gserviceaccount.com</span>) with the <strong>Viewer</strong> role.</li>
        <li>Still in Admin → Property settings, copy the numeric <strong>Property ID</strong> (not the G- measurement ID).</li>
        <li>Copy the JSON key to the web host as <span className="font-mono text-xs">/etc/socbench/ga-service-account.json</span> (owner root, group socbench, mode 0640), add <span className="font-mono text-xs">GOOGLE_ANALYTICS_PROPERTY_ID</span> and <span className="font-mono text-xs">GOOGLE_ANALYTICS_SERVICE_ACCOUNT_FILE</span> to the web host&apos;s environment file, and restart the site.</li>
      </ol>
    </Alert>
  );
}
