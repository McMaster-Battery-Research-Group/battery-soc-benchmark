/**
 * Ring buffer of the worker's recent console output. It is mirrored into the
 * WorkerHeartbeat row every 15 s so administrators can read it on /admin/workers.
 * Job-level lines (evaluation progress) are pushed here explicitly by run-job.ts
 * because they are written to stdout directly, not through console.log.
 */
const LOG_LINES = 200;
const ring: string[] = [];

export function pushConsole(line: string) {
  ring.push(`${new Date().toISOString()} ${line}`);
  if (ring.length > LOG_LINES) ring.splice(0, ring.length - LOG_LINES);
}

export function consoleTail() {
  return ring.join("\n");
}

/** Mirror console.log/warn/error into the ring (call once, at worker start). */
export function installConsoleMirror() {
  for (const k of ["log", "error", "warn"] as const) {
    const orig = console[k].bind(console);
    console[k] = (...a: unknown[]) => {
      orig(...a);
      pushConsole(a.map((x) => (x instanceof Error ? x.stack ?? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    };
  }
}
