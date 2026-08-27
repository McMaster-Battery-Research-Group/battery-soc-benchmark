/**
 * Structured one-line event logs for the web tier (visible in Vercel → Logs,
 * or the terminal under `next dev`). Never log secrets or full e-mail bodies;
 * user ids and e-mails are fine (they are needed to debug support requests).
 *
 *   logEvent("submission.created", { seq: 64, userId, modelType })
 *   → 2026-08-27T03:10:11.123Z event=submission.created seq=64 userId=… modelType=FNN
 */
export function logEvent(event: string, data: Record<string, unknown> = {}) {
  const kv = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" && /\s/.test(v) ? JSON.stringify(v) : String(v)}`)
    .join(" ");
  console.log(`${new Date().toISOString()} event=${event}${kv ? " " + kv : ""}`);
}
