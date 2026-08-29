/** Plain-language definitions used by the Glossary page and inline <Term> tooltips. */
export interface GlossaryEntry {
  key: string;
  term: string;
  /** how the term reads mid-sentence when it differs from lower-casing the first letter (proper nouns) */
  inline?: string;
  short: string; // one sentence, for tooltips
  long?: string; // extra detail for the glossary page
  group: "Basics" | "Metrics" | "Tests & data" | "Methods";
}

export const GLOSSARY: GlossaryEntry[] = [
  { key: "soc", term: "State of charge (SOC)", inline: "state of charge", group: "Basics", short: "How full the battery is, from 0 % (empty) to 100 % (full) — the EV equivalent of a fuel gauge.", long: "Unlike a fuel tank, SOC cannot be measured directly. It has to be estimated from what a battery management system can measure: current, voltage and temperature. Getting it wrong means either stranding the driver or leaving usable range on the table." },
  { key: "estimator", term: "SOC estimator", group: "Basics", short: "An algorithm that turns measured current, voltage and temperature into an SOC estimate, once per second.", long: "Estimators range from simple current integration (Coulomb counting) to model-based filters and neural networks. On this site an estimator is a MATLAB function Model(X, z) that is called for every 1 Hz sample." },
  { key: "cell", term: "Cell", group: "Basics", short: "A single battery unit; a Tesla Model 3 pack contains 2,976 of the 2170 cells tested here.", long: "The dataset is measured on individual cylindrical 2170 cells (21 mm diameter, 70 mm long). Pack-level behaviour is derived by scaling the vehicle power demand down to one cell." },
  { key: "bms", term: "Battery management system (BMS)", inline: "battery management system", group: "Basics", short: "The on-board electronics that monitor a battery and run the SOC estimator in a real vehicle." },
  { key: "drive-cycle", term: "Drive cycle", group: "Tests & data", short: "A standard speed-vs-time profile (e.g. UDDS = city driving, HWFET = highway) converted into the current a cell would see.", long: "UDDS (urban), HWFET (highway), LA92 (aggressive urban) and US06 (high-speed, high-acceleration) are US EPA certification cycles. HWCUST and HWGRADE are custom 100–130 km/h highway cycles, the latter with up to 10 % grades to mimic mountain passes. Cycles are repeated until the cell can no longer deliver 60 kW at pack level." },
  { key: "blinded", term: "Blinded data", group: "Tests & data", short: "Test data that is never released. Models are scored on it so they cannot be tuned to the answers.", long: "One whole cell (m448) and the standard drive cycles for every cell are withheld. This is what makes the leaderboard a fair comparison between methods rather than a measure of who over-fitted the test set." },
  { key: "open-data", term: "Open data", group: "Tests & data", short: "The part of the dataset you can download and train or parameterise on: characterization tests plus reordered and custom drive cycles for three cells." },
  { key: "hppc", term: "HPPC test", group: "Tests & data", short: "Hybrid Pulse Power Characterization: short current pulses at many SOC levels used to measure a cell's internal resistance and open-circuit voltage.", long: "Ten-second discharge and charge pulses of several magnitudes are applied at 100, 95, 90, 80 … 5 % SOC after a one-hour rest. The voltage response gives resistance and dynamic parameters for equivalent-circuit models; the rested voltage gives the OCV–SOC curve." },
  { key: "ocv", term: "Open-circuit voltage (OCV)", inline: "open-circuit voltage", group: "Tests & data", short: "The cell voltage after resting with no current; it maps almost one-to-one to SOC, which many estimators exploit." },
  { key: "c-rate", term: "C-rate", group: "Tests & data", short: "Current relative to capacity: 1C fully discharges a 4.5 Ah cell in one hour, C/20 takes twenty hours." },
  { key: "payload", term: "Payload / HVAC cases", inline: "payload / HVAC cases", group: "Tests & data", short: "Each cell was cycled with a different vehicle load: 80, 448 or 1000 kg of payload, with cabin heating/cooling on or off, so the data spans light to heavy use." },
  { key: "rmse", term: "RMSE", group: "Metrics", short: "Root-mean-square error between estimated and true SOC over a cycle, in % SOC. The main accuracy metric; lower is better.", long: "RMSE penalises large errors more than small ones, so a model that is mostly right but occasionally far off scores worse than one with small steady errors." },
  { key: "mae", term: "MAE", group: "Metrics", short: "Mean absolute error — the average size of the SOC error over a cycle, in % SOC." },
  { key: "maxe", term: "Max error (MAXE)", inline: "max error", group: "Metrics", short: "The single worst instantaneous SOC error in a cycle. Shows how badly a model can be wrong even if it is usually accurate." },
  { key: "weighted-error", term: "Weighted error", group: "Metrics", short: "The leaderboard score: a weighted average of the test-case RMSE values, so hard conditions and robustness count as much as easy ones. Lower is better.", long: "Every test type (blinded cell, charging, loads, drive-cycle type, temperature, initial-SOC error, sensor offset) carries weight 0.1, split across its sub-cases; 'all cells' is weighted 0 because it is already contained in the others. Weights sum to 1, so the score reads like an RMSE in % SOC." },
  { key: "complexity", term: "Complexity", group: "Metrics", short: "A 1–10 classification of how much computation a model needs in the evaluator (1 = trivial coulomb counter, 10 = extreme)." },
  { key: "test-case", term: "Test case", group: "Metrics", short: "A named subset of the blinded cycles (e.g. '−20 °C' or 'charging') whose RMSE values are averaged into one number." },
  { key: "coulomb-counting", term: "Coulomb counting", group: "Methods", short: "Integrating current over time to track charge in and out. Simple and fast, but drifts with sensor offset and needs a known starting SOC." },
  { key: "ekf", term: "Kalman filter (EKF/UKF)", inline: "Kalman filter", group: "Methods", short: "A model-based estimator that blends a battery model's prediction with voltage measurements, correcting drift. EKF and UKF handle the non-linear voltage–SOC relationship in different ways." },
  { key: "ecm", term: "Equivalent-circuit model (ECM)", inline: "equivalent-circuit model", group: "Methods", short: "A battery represented as a voltage source plus resistors and capacitors; its parameters come from HPPC data and feed Kalman-filter estimators." },
  { key: "nn", term: "Neural-network estimators (FNN, LSTM, GRU, Transformer)", inline: "neural-network estimators", group: "Methods", short: "Data-driven models trained on the open data to map measurements to SOC. Recurrent types (LSTM, GRU) keep memory of past samples; FNNs use averaged inputs instead." },
  { key: "initial-soc", term: "Initial SOC error", group: "Metrics", short: "A robustness test: the estimator starts while the true SOC is 90, 60 or 30 % instead of 100 %, as if the vehicle woke from an unknown state." },
  { key: "sensor-offset", term: "Current sensor offset", group: "Metrics", short: "A robustness test: a constant ±0.1 A or ±0.3 A error is added to the measured current, which makes pure coulomb counting drift." },
];

export const GLOSSARY_BY_KEY = Object.fromEntries(GLOSSARY.map((g) => [g.key, g])) as Record<string, GlossaryEntry>;
