import { CELLS, DRIVE_CYCLES, TEMPERATURES_C, type MetricKey } from "@/lib/test-cases";
import { round, weightedError, type MetricValues } from "@/lib/scoring";
import type { DryRunOutput, EvaluationOutput, Evaluator, EvaluationInput, PerCycleRow, TimeSeriesTrace } from "./types";

/** Small deterministic PRNG (mulberry32) so a given submission always evaluates identically. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Baseline "all cells" RMSE (%) and complexity by model family — calibrated to the values observed on the existing staging leaderboard. */
const BASELINES: Record<string, { err: number; spread: number; complexity: number; tempSens: number }> = {
  LSTM: { err: 2.6, spread: 0.6, complexity: 5, tempSens: 1.6 },
  GRU: { err: 2.8, spread: 0.6, complexity: 5, tempSens: 1.6 },
  TRANSFORMER: { err: 2.4, spread: 0.7, complexity: 7, tempSens: 1.5 },
  FNN: { err: 4.2, spread: 0.8, complexity: 4, tempSens: 1.8 },
  EKF: { err: 9, spread: 4, complexity: 8, tempSens: 1.4 },
  UKF: { err: 7, spread: 3, complexity: 9, tempSens: 1.4 },
  PHYSICS: { err: 6, spread: 2, complexity: 9, tempSens: 1.3 },
  HYBRID: { err: 3.2, spread: 1, complexity: 7, tempSens: 1.5 },
  COULOMB_COUNTER: { err: 30, spread: 8, complexity: 1, tempSens: 1.2 },
  OTHER: { err: 8, spread: 4, complexity: 5, tempSens: 1.5 },
};

const TEMP_FACTOR: Record<number, number> = { [-20]: 2.4, [-10]: 1.5, 0: 1.1, 10: 0.95, 25: 0.9, 40: 1.05 };
const CYCLE_FACTOR: Record<string, number> = { UDDS: 1, HWFET: 0.85, LA92: 1.05, US06: 1.15, HWCUST: 1.2, HWGRADE: 1.9 };
const CELL_FACTOR: Record<string, number> = { m80: 1, m448: 0.85, "m448-N": 1.15, m1000: 1.2 };

export class MockEvaluator implements Evaluator {
  readonly name = "mock";
  constructor(private readonly simulatedSeconds = Number(process.env.MOCK_EVAL_SECONDS ?? 8)) {}

  async dryRun(input: EvaluationInput): Promise<DryRunOutput> {
    const rand = rng(input.submissionId + ":dry");
    const base = BASELINES[input.modelType] ?? BASELINES.OTHER;
    await input.log("[mock] dry run on open data: m80 REORDERED1 @ 25C");
    await sleep(this.simulatedSeconds * 200);
    const n = 240;
    const r = base.err * (0.8 + rand() * 0.4);
    const t: number[] = [];
    const actual: number[] = [];
    const estimated: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      t.push(round(x * 2, 3));
      actual.push(round(100 - 15 * x, 2));
      estimated.push(round(100 - 15 * x + (rand() - 0.5) * r * 2, 2));
    }
    return { runtime: "mock", cycle: { cell: "m80", cycle: "REORDERED1", temperatureC: 25, samples: 7200 }, rmse: round(r, 3), mae: round(r * 0.8, 3), maxErr: round(r * 2.5, 3), secondsPerSample: 2e-6, complexity: base.complexity, trace: { t, actual, estimated }, elapsedSec: 2 };
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    const rand = rng(input.submissionId);
    const base = BASELINES[input.modelType] ?? BASELINES.OTHER;
    const scale = 1 + (rand() - 0.5) * 2 * (base.spread / base.err);
    const tempSens = base.tempSens * (0.85 + rand() * 0.3);

    await input.log(`[mock] loading ${input.fileType} model from ${input.filePath}`);
    await sleep(this.simulatedSeconds * 250);
    await input.log(`[mock] running ${CELLS.length * TEMPERATURES_C.length * DRIVE_CYCLES.length} blinded drive cycles`);

    const perCycle: PerCycleRow[] = [];
    for (const cell of CELLS) {
      for (const temperatureC of TEMPERATURES_C) {
        for (const cycle of DRIVE_CYCLES) {
          const tf = 1 + (TEMP_FACTOR[temperatureC] - 1) * (tempSens / 1.6);
          const rmse = base.err * scale * tf * CYCLE_FACTOR[cycle] * CELL_FACTOR[cell] * (0.8 + rand() * 0.4);
          perCycle.push({
            cell,
            cycle,
            temperatureC,
            rmse: round(rmse, 3),
            mae: round(rmse * (0.7 + rand() * 0.15), 3),
            maxErr: round(rmse * (2.5 + rand() * 2), 3),
            durationH: round((cycle.startsWith("HW") ? 1.4 : 4.2) * (temperatureC < 0 ? 0.75 : 1) * (0.9 + rand() * 0.2), 2),
          });
        }
      }
    }
    await sleep(this.simulatedSeconds * 500);

    const mean = (rows: PerCycleRow[]) => round(rows.reduce((a, r) => a + r.rmse, 0) / Math.max(1, rows.length), 3);
    const sel = (f: (r: PerCycleRow) => boolean) => perCycle.filter(f);
    const std = (c: string) => ["UDDS", "HWFET", "LA92", "US06"].includes(c);

    const metrics: MetricValues = {
      allCells: mean(perCycle),
      blindedCell: mean(sel((r) => r.cell === "m448")),
      nonBlindedCells: mean(sel((r) => r.cell !== "m448")),
      charging: round(mean(sel((r) => r.cell === "m80")) * (0.35 + rand() * 0.2), 3),
      massM80: mean(sel((r) => r.cell === "m80")),
      massM448: mean(sel((r) => r.cell === "m448")),
      massM448N: mean(sel((r) => r.cell === "m448-N")),
      massM1000: mean(sel((r) => r.cell === "m1000")),
      standardCycles: mean(sel((r) => r.cell === "m1000" && std(r.cycle))),
      nonStandardCycles: mean(sel((r) => r.cell === "m1000" && !std(r.cycle))),
      tempM20: mean(sel((r) => r.cell === "m80" && r.temperatureC === -20)),
      tempM10: mean(sel((r) => r.cell === "m80" && r.temperatureC === -10)),
      temp0: mean(sel((r) => r.cell === "m80" && r.temperatureC === 0)),
      temp10: mean(sel((r) => r.cell === "m80" && r.temperatureC === 10)),
      temp25: mean(sel((r) => r.cell === "m80" && r.temperatureC === 25)),
      temp40: mean(sel((r) => r.cell === "m80" && r.temperatureC === 40)),
      initialSocError: 0,
      currentSensorOffset: 0,
    };
    // Robustness cases: filters/recurrent models recover; open-loop coulomb counting does not.
    const openLoop = input.modelType === "COULOMB_COUNTER";
    metrics.initialSocError = round(metrics.allCells * (openLoop ? 1.6 + rand() * 0.6 : 1.15 + rand() * 0.3), 3);
    metrics.currentSensorOffset = round(metrics.allCells * (openLoop ? 2 + rand() * 1 : 1.1 + rand() * 0.4), 3);

    const timeSeries = buildTraces(perCycle, rand, base, tempSens);
    await input.log(`[mock] done — all-cells RMSE ${metrics.allCells.toFixed(3)} %`);
    await sleep(this.simulatedSeconds * 250);

    return {
      ...metrics,
      weightedError: weightedError(metrics),
      complexity: Math.max(1, Math.min(10, base.complexity + Math.round((rand() - 0.5) * 2))),
      complexityUncertainty: 1,
      maxError: round(Math.max(...perCycle.map((r) => r.maxErr)), 3),
      perCycle,
      timeSeries,
      evaluatorVersion: "mock-1",
    };
  }
}

const TRACE_SPECS: { cell: string; cycle: string; temperatureC: number }[] = [
  { cell: "m80", cycle: "UDDS", temperatureC: -20 },
  { cell: "m80", cycle: "UDDS", temperatureC: 0 },
  { cell: "m80", cycle: "UDDS", temperatureC: 40 },
  { cell: "m80", cycle: "US06", temperatureC: 25 },
  { cell: "m1000", cycle: "HWFET", temperatureC: 25 },
  { cell: "m1000", cycle: "HWCUST", temperatureC: 25 },
  { cell: "m1000", cycle: "HWGRADE", temperatureC: 25 },
  { cell: "m448", cycle: "LA92", temperatureC: 10 },
];

function buildTraces(
  perCycle: PerCycleRow[],
  rand: () => number,
  base: { err: number },
  tempSens: number,
): TimeSeriesTrace[] {
  const N = 240;
  return TRACE_SPECS.map((spec) => {
    const row = perCycle.find((r) => r.cell === spec.cell && r.cycle === spec.cycle && r.temperatureC === spec.temperatureC)!;
    const t: number[] = [];
    const actual: number[] = [];
    const estimated: number[] = [];
    const minSoc = spec.temperatureC <= -10 ? 30 : spec.temperatureC <= 0 ? 15 : 5;
    const grade = spec.cycle === "HWGRADE";
    let bias = (rand() - 0.5) * row.rmse * 1.5;
    let lag = 0;
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      const tt = round(x * row.durationH, 3);
      let soc = 100 - (100 - minSoc) * x;
      if (grade) soc += Math.sin(x * 28) * 3; // regen on descents
      soc = Math.max(minSoc - 2, Math.min(100, soc));
      const noise = (rand() - 0.5) * row.rmse * 1.6;
      bias += (rand() - 0.5) * row.rmse * 0.12;
      bias *= 0.985;
      lag = lag * 0.9 + (grade ? Math.sin(x * 28 + 0.5) * row.rmse * 1.2 : 0) * 0.1;
      const initErr = i < 15 ? (15 - i) * (base.err / 15) * 0.6 : 0;
      const est = soc + noise + bias + lag + initErr * (tempSens / 1.6);
      t.push(tt);
      actual.push(round(soc, 2));
      estimated.push(round(Math.max(0, Math.min(100, est)), 2));
    }
    return {
      key: `${spec.cell}-${spec.cycle}-${spec.temperatureC}`,
      label: `${spec.cell} ${spec.cycle} at ${spec.temperatureC} °C`,
      ...spec,
      t,
      actual,
      estimated,
    };
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type { MetricKey };
