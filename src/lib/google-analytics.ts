import { createHash } from "crypto";
import { hostname } from "os";

/**
 * Google Analytics 4.
 *
 * Site: the GA tag is loaded by the root layout when a measurement ID is configured, and
 * <AnalyticsEvents> reports link clicks, opted-in button clicks and signed-in visits.
 * Production builds use GOOGLE_ANALYTICS_ID; `next dev` uses GOOGLE_ANALYTICS_DEV_ID, so local
 * clicks never land in the real property. Leave both blank and nothing is loaded.
 *
 * Worker: evaluation outcomes are reported through the Measurement Protocol, which needs the
 * API secret. The secret lives only on the worker host: never in the browser, never in git.
 */
export function gaMeasurementId(): string | undefined {
  const id = process.env.NODE_ENV === "production" ? process.env.GOOGLE_ANALYTICS_ID : process.env.GOOGLE_ANALYTICS_DEV_ID;
  return id && /^G-[A-Z0-9]+$/.test(id) ? id : undefined;
}

type EvaluationStatus = "succeeded" | "failed";

// One stable pseudo-user per worker host, so GA counts machines rather than a new user per event.
const workerClientId = createHash("sha256").update(`socbench-worker:${hostname()}`).digest("hex").slice(0, 32);

/**
 * Reports an evaluation outcome (model type, succeeded/failed) as an aggregate GA event from the
 * worker. Fire-and-forget: the job never waits on it, it gives up after 5 s and never throws.
 * The secret must belong to the property of GOOGLE_ANALYTICS_ID on the same host.
 */
export function trackEvaluationOutcome(modelType: string, status: EvaluationStatus): void {
  const measurementId = process.env.GOOGLE_ANALYTICS_ID;
  const apiSecret = process.env.GOOGLE_ANALYTICS_API_SECRET;
  if (!measurementId || !apiSecret) return;
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  // GA4 event names allow only letters, digits and underscores; the detail travels in the parameters.
  const body = JSON.stringify({
    client_id: workerClientId,
    non_personalized_ads: true,
    events: [{ name: "evaluation_outcome", params: { model_type: modelType, evaluation_status: status } }],
  });
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5000) })
    .then((r) => {
      if (!r.ok) console.warn(`[analytics] evaluation outcome not accepted: HTTP ${r.status}`);
    })
    .catch((e) => console.warn("[analytics] evaluation outcome not sent:", e instanceof Error ? e.message : String(e)));
}
