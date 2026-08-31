import { db } from "@/lib/db";

/**
 * Evaluation policy knobs, editable on Admin → Evaluation workers and stored in one DB row.
 * Precedence: DB row → environment variable → hard default. Cached for 15 s, so the worker
 * (which checks per job) and the web tier pick changes up without a restart.
 * Machine-bound tuning (EVAL_CPUS, EVAL_MEMORY, WORKER_CONCURRENCY) intentionally stays in env.
 */
export type EvalSettings = { evalTimeoutMin: number; dryRunTimeoutMin: number; submissionsPerDay: number; updatedAt: Date | null; updatedBy: string | null };

const DEFAULTS = () => ({
  evalTimeoutMin: Number(process.env.PY_EVAL_TIMEOUT_MIN ?? 360),
  dryRunTimeoutMin: Number(process.env.DRY_RUN_TIMEOUT_MIN ?? 10),
  submissionsPerDay: Number(process.env.SUBMISSIONS_PER_DAY ?? 3),
});

let cache: { at: number; value: EvalSettings } | null = null;

export async function getEvalSettings(fresh = false): Promise<EvalSettings> {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.value;
  let value: EvalSettings;
  try {
    const row = await db.evalSettings.findUnique({ where: { id: 1 } });
    value = row
      ? { evalTimeoutMin: row.evalTimeoutMin, dryRunTimeoutMin: row.dryRunTimeoutMin, submissionsPerDay: row.submissionsPerDay, updatedAt: row.updatedAt, updatedBy: row.updatedBy }
      : { ...DEFAULTS(), updatedAt: null, updatedBy: null };
  } catch {
    value = { ...DEFAULTS(), updatedAt: null, updatedBy: null }; // DB hiccup: fall back, never block an evaluation
  }
  cache = { at: Date.now(), value };
  return value;
}
