/**
 * Blinded test cases, metrics and official leaderboard weights.
 *
 * Sources:
 *  - Table IV, Kollmeyer, Naguib, Khanum, Emadi, "A Blind Modeling Tool for Standardized
 *    Evaluation of Battery State of Charge Estimation Algorithms", ITEC 2022.
 *  - "03-Output Data – Standardized Evaluation Tool" (Blind Modeling Tool V2 documentation):
 *    weighted-error system. Test 1 (all cells) is weighted 0 because it is encompassed by
 *    every other test; the remaining tests share equal weight per test *type*.
 *
 * `key` matches the column on the EvaluationResult Prisma model.
 */
export type TestCaseGroup = "overview" | "conditions" | "temperature" | "robustness";

export interface TestCaseDef {
  key: MetricKey;
  test: number; // paper test-case number (1–11)
  label: string;
  short: string;
  group: TestCaseGroup;
  description: string;
  /** Official V2 leaderboard weight (sums to 1 across all tests). */
  weight: number;
  /** Shown on the leaderboard by default */
  defaultVisible: boolean;
}

export const METRIC_KEYS = [
  "allCells",
  "blindedCell",
  "nonBlindedCells",
  "charging",
  "massM80",
  "massM448",
  "massM448N",
  "massM1000",
  "standardCycles",
  "nonStandardCycles",
  "tempM20",
  "tempM10",
  "temp0",
  "temp10",
  "temp25",
  "temp40",
  "initialSocError",
  "currentSensorOffset",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

/**
 * One sentence, used wherever the site describes what a blinded evaluation runs, so the wording stays consistent
 * (the 144 cycles are only part of it — tests 4, 10 and 11 add charging profiles, wrong-initial-SOC and sensor-offset runs).
 */
export const EVALUATION_SCOPE = "144 blinded drive cycles (four cells, six temperatures from −20 °C to 40 °C) plus the robustness tests — wrong initial SOC, current-sensor offsets and charging profiles — 195 evaluation runs in all";

export const TEST_CASES: TestCaseDef[] = [
  { key: "allCells", test: 1, label: "All cells", short: "All cells", group: "overview", description: "All four cells, all blinded drive cycles. The single headline accuracy value; weighted 0 in the final score because every other test is a subset of it.", weight: 0, defaultVisible: true },
  { key: "blindedCell", test: 2, label: "Blinded cell (m448)", short: "Blinded", group: "overview", description: "The m448 cell, for which no characterization or drive-cycle data is released — a true generalisation test.", weight: 0.1, defaultVisible: true },
  { key: "nonBlindedCells", test: 3, label: "Non-blinded cells", short: "Non-blinded", group: "overview", description: "m80, m448-N and m1000 cells, blinded drive cycles only.", weight: 0.1, defaultVisible: true },
  { key: "charging", test: 4, label: "Charging", short: "Charging", group: "conditions", description: "CC-CV charge profiles for the m80 cell.", weight: 0.1, defaultVisible: true },
  { key: "massM80", test: 5, label: "80 kg payload", short: "80 kg", group: "conditions", description: "Range of loads — single-passenger vehicle model (m80 cell, HVAC on).", weight: 1 / 30, defaultVisible: false },
  { key: "massM448", test: 5, label: "448 kg payload, HVAC on", short: "448 kg · HVAC on", group: "conditions", description: "Range of loads — maximum rated payload with cabin HVAC (m448 cell).", weight: 2 / 30, defaultVisible: false },
  { key: "massM448N", test: 6, label: "448 kg payload, HVAC off", short: "448 kg · HVAC off", group: "conditions", description: "Range of loads — maximum rated payload without cabin HVAC (m448-N cell).", weight: 2 / 30, defaultVisible: false },
  { key: "massM1000", test: 5, label: "1000 kg payload", short: "1000 kg", group: "conditions", description: "Range of loads — towing a small trailer (m1000 cell). Highest current demand.", weight: 1 / 30, defaultVisible: false },
  { key: "standardCycles", test: 7, label: "Standard drive cycles", short: "Standard", group: "conditions", description: "UDDS, HWFET, LA92 and US06 for the m1000 cell.", weight: 0.1, defaultVisible: false },
  { key: "nonStandardCycles", test: 8, label: "Non-standard drive cycles", short: "HWCUST/HWGRADE", group: "conditions", description: "HWCUST and HWGRADE highway / mountain-pass cycles for the m1000 cell.", weight: 0.1, defaultVisible: false },
  { key: "tempM20", test: 9, label: "−20 °C", short: "−20 °C", group: "temperature", description: "m80 cell at −20 °C ambient. Resistance is ~10× higher than at 40 °C.", weight: 1 / 60, defaultVisible: true },
  { key: "tempM10", test: 9, label: "−10 °C", short: "−10 °C", group: "temperature", description: "m80 cell at −10 °C ambient.", weight: 1 / 60, defaultVisible: false },
  { key: "temp0", test: 9, label: "0 °C", short: "0 °C", group: "temperature", description: "m80 cell at 0 °C ambient.", weight: 1 / 60, defaultVisible: false },
  { key: "temp10", test: 9, label: "10 °C", short: "10 °C", group: "temperature", description: "m80 cell at 10 °C ambient.", weight: 1 / 60, defaultVisible: false },
  { key: "temp25", test: 9, label: "25 °C", short: "25 °C", group: "temperature", description: "m80 cell at 25 °C ambient.", weight: 1 / 60, defaultVisible: false },
  { key: "temp40", test: 9, label: "40 °C", short: "40 °C", group: "temperature", description: "m80 cell at 40 °C ambient.", weight: 1 / 60, defaultVisible: false },
  { key: "initialSocError", test: 10, label: "Initial SOC error", short: "Init. SOC", group: "robustness", description: "The estimator is started with the true SOC at 90 %, 60 % and 30 % instead of 100 %, emulating an unknown initial state.", weight: 0.1, defaultVisible: true },
  { key: "currentSensorOffset", test: 11, label: "Current sensor offset", short: "I offset", group: "robustness", description: "Constant offsets of ±0.1 A and ±0.3 A are added to the measured current.", weight: 0.1, defaultVisible: true },
];

export const TEST_CASE_BY_KEY: Record<MetricKey, TestCaseDef> = Object.fromEntries(
  TEST_CASES.map((t) => [t.key, t]),
) as Record<MetricKey, TestCaseDef>;

export const GROUP_LABELS: Record<TestCaseGroup, string> = {
  overview: "Estimation accuracy (tests 1–3)",
  conditions: "Operating conditions (tests 4–8)",
  temperature: "Range of temperatures (test 9)",
  robustness: "Model robustness (tests 10–11)",
};

export const TEMPERATURES_C = [-20, -10, 0, 10, 25, 40] as const;
export const CELLS = ["m80", "m448", "m448-N", "m1000"] as const;
export const DRIVE_CYCLES = ["UDDS", "HWFET", "LA92", "US06", "HWCUST", "HWGRADE"] as const;

export const CELL_INFO: Record<(typeof CELLS)[number], { payloadKg: number; hvac: boolean; channel: number; blind: boolean }> = {
  m80: { payloadKg: 80, hvac: true, channel: 1, blind: false },
  m448: { payloadKg: 448, hvac: true, channel: 2, blind: true },
  "m448-N": { payloadKg: 448, hvac: false, channel: 3, blind: false },
  m1000: { payloadKg: 1000, hvac: true, channel: 4, blind: false },
};

export const MODEL_TYPE_LABELS: Record<string, string> = {
  COULOMB_COUNTER: "Coulomb counter",
  EKF: "Extended Kalman Filter",
  UKF: "Unscented Kalman Filter",
  LSTM: "LSTM",
  GRU: "GRU",
  FNN: "Feedforward NN",
  TRANSFORMER: "Transformer",
  PHYSICS: "Physics-based",
  HYBRID: "Hybrid",
  OTHER: "Other",
};

export const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  RUNNING: "Evaluating",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

/** Complexity classification shown on the leaderboard (1 = trivial … 10 = heavy). */
export const COMPLEXITY_LABELS: Record<number, string> = {
  1: "Trivial", 2: "Very low", 3: "Low", 4: "Low–moderate", 5: "Moderate", 6: "Moderate–high", 7: "High", 8: "Very high", 9: "Extreme", 10: "Extreme+",
};
