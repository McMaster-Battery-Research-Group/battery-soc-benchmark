/**
 * The four reference submission packages shipped in
 * "4-SOC estimation Model Examples.zip" (Blind Modeling Tool V2, McMaster 2024),
 * with their source (weight matrices elided) and a structured model spec used
 * by <ModelSchematic>.
 */
import type { ModelSpec } from "@/components/model-schematic";

export interface ExampleModel {
  slug: string;
  name: string;
  modelType: string;
  tagline: string;
  description: string[];
  files: { name: string; note: string }[];
  code: string;
  codeNote?: string;
  spec: ModelSpec;
  strengths: string[];
  weaknesses: string[];
  complexity: number;
}

export const EXAMPLES: ExampleModel[] = [
  {
    slug: "coulomb-counter",
    name: "Example 1 — Coulomb counter",
    modelType: "COULOMB_COUNTER",
    tagline: "Integrate current, divide by capacity. Twenty lines, the best way to learn the interface.",
    description: [
      "The simplest possible estimator: charge in and out of the cell is counted by integrating current at the 1 Hz sample rate and dividing by a fixed nominal capacity. The previous SOC is carried between calls in z.",
      "It assumes the battery always starts full, ignores temperature-dependent capacity, and has no way to correct itself — so any current-sensor offset accumulates without bound. That is exactly why the robustness test cases exist.",
    ],
    files: [{ name: "Model.m", note: "the estimator" }, { name: "Settings.xlsx", note: "legacy metadata — not required by this site" }],
    code: `% SOC Estimation Example V2
% Online Coulomb Counting SOC Estimator - McMaster University 2024
function [Y_est, z] = Model(X, z)
    % Input X: Measured current, voltage, and temperature values
    % X: 3 columns, 1 row

    % Current is negative-discharging, positive-charging
    Current = X(1);             % in [Amps]

    % Voltage is unused in this Coulomb Counter
    % Voltage = X(2);           % in [Volts]

    % Temperature is unused in this Coulomb Counter
    % Temperature = X(3);       % in [Celsius]

    Capacity = 4.6;             % in [Ah], nominal capacity of the cell

    % Coulomb Counting SOC Estimator: SOC = integral of current
    if nargin == 1              % start of measurement (z = [])
        SOC = 1;                % assume battery always starts fully charged
        z = SOC;                % send back previous SOC as memory z
    else
        previous_SOC = z;       % load z as previous SOC
        SOC = previous_SOC + Current*(1/3600)/Capacity; % integrate current
        z = SOC;                % send back previous SOC as memory z
    end

    % Output Y: Estimated SOC (1 row, 1 column)
    Y_est = SOC';
end`,
    spec: { kind: "coulomb", capacityAh: 4.6 },
    strengths: ["Trivial to implement and verify", "Zero latency, negligible compute", "Exact if capacity, initial SOC and current are exact"],
    weaknesses: ["Drifts with any current-sensor offset", "Fails the initial-SOC test outright (assumes 100 %)", "Ignores temperature-dependent usable capacity"],
    complexity: 1,
  },
  {
    slug: "ekf",
    name: "Example 2 — Extended Kalman filter",
    modelType: "EKF",
    tagline: "A third-order equivalent-circuit model corrected by voltage measurements.",
    description: [
      "The battery is modelled as an open-circuit voltage source in series with an ohmic resistance R0 and three RC pairs. The state vector holds the three RC voltages and SOC. Each second the filter predicts the state with the circuit equations, then corrects it using the difference between measured and predicted terminal voltage.",
      "OCV–SOC curves come from the HPPC rests at each temperature, and the ECM parameters were fitted to the open data with a genetic algorithm. Parameters depend on temperature (selected once at initialisation from X(3)) and SOC (re-interpolated whenever SOC moves by more than 2 %). Because the filter trusts voltage, it recovers from a wrong initial SOC and from a current offset — the two robustness tests where Coulomb counting fails.",
    ],
    files: [
      { name: "Model.m", note: "the estimator" },
      { name: "ECM_parameters.mat", note: "R0, R1–R3, τ1–τ3 vs SOC for each temperature" },
      { name: "OCV_table.mat", note: "OCV–SOC curves per temperature" },
      { name: "EKF_parameters.mat", note: "process (Q) and measurement (R) noise covariances" },
      { name: "Settings.xlsx", note: "legacy metadata — not required by this site" },
    ],
    code: `% SOC Estimation Example V2 — Extended Kalman Filter (3RC ECM)
function [SOC_Pred, z] = Model(X, z)
I = -X(1);                       % positive = discharge inside the model
V = X(2);
if nargin < 2                    % ---- initialisation (first sample only)
    data = load('ECM_parameters');  ECM = data.ECM;
    data = load('OCV_table.mat');   OCV_table = data.OCV_table; SOC_range = data.SOC_range;
    data = load('EKF_parameters.mat'); EKF = data.EKF;
    % pick the parameter set for the measured temperature
    if     X(3) > 30,   z.Param = ECM.T40;  z.EKF = EKF.T40;  T = 6;
    elseif X(3) > 17.5, z.Param = ECM.T25;  z.EKF = EKF.T25;  T = 5;
    elseif X(3) > 5,    z.Param = ECM.T10;  z.EKF = EKF.T10;  T = 4;
    elseif X(3) > -5,   z.Param = ECM.T0;   z.EKF = EKF.T0;   T = 3;
    elseif X(3) > -15,  z.Param = ECM.Tn10; z.EKF = EKF.Tn10; T = 2;
    else                z.Param = ECM.Tn20; z.EKF = EKF.Tn20; T = 1;
    end
    z.OCV_SOC = OCV_table(T,:);  z.SOC_range = SOC_range;
    init_SOC = min(1, max(0, interp1(z.OCV_SOC, SOC_range, X(1,2), 'linear', 'extrap')));
    z.C0 = 4.68;                 % capacity [Ah]
    z.R0 = interp1(z.Param.SOC, z.Param.R0, init_SOC, 'linear', 'extrap');
    z.R1 = interp1(z.Param.SOC, z.Param.R1, init_SOC, 'linear', 'extrap');
    z.R2 = interp1(z.Param.SOC, z.Param.R2, init_SOC, 'linear', 'extrap');
    z.R3 = interp1(z.Param.SOC, z.Param.R3, init_SOC, 'linear', 'extrap');
    z.C1 = interp1(z.Param.SOC, z.Param.T1, init_SOC, 'linear', 'extrap') / z.R1;
    z.C2 = interp1(z.Param.SOC, z.Param.T2, init_SOC, 'linear', 'extrap') / z.R2;
    z.C3 = interp1(z.Param.SOC, z.Param.T3, init_SOC, 'linear', 'extrap') / z.R3;
    z.Param.SOC_now = init_SOC;
    P = diag([0.05, 0.05, 0.05, 0.001]);   % initial state covariance
    x = [0 0 0 init_SOC];                  % [V_RC1 V_RC2 V_RC3 SOC]
else
    P = z.P;  x = z.x;
end
R = z.EKF.R;  Q = z.EKF.Q;

% state transition: three RC branches + Coulomb counting for SOC
f = @(x) [exp(-1/(z.C1*z.R1))*x(1) + (1-exp(-1/(z.R1*z.C1)))*z.R1*I;
          exp(-1/(z.C2*z.R2))*x(2) + (1-exp(-1/(z.R2*z.C2)))*z.R2*I;
          exp(-1/(z.C3*z.R3))*x(3) + (1-exp(-1/(z.R3*z.C3)))*z.R3*I;
          x(4) - 1/(3600*z.C0)*I];
% measurement: terminal voltage = OCV(SOC) - RC drops (- R0*I applied via H)
h = @(x) interp1(z.SOC_range, z.OCV_SOC, x(4), 'linear', 'extrap') - x(1) - x(2) - x(3);

F = diag([exp(-1/(z.C1*z.R1)), exp(-1/(z.C2*z.R2)), exp(-1/(z.C3*z.R3)), 0]);
% dOCV/dSOC by central differences, then Jacobian of h
n = length(z.OCV_SOC);  dOCV_dSOC = zeros(size(z.OCV_SOC));
for i = 2:n-1
    dOCV_dSOC(i) = (z.OCV_SOC(i+1) - z.OCV_SOC(i-1)) / (z.SOC_range(i+1) - z.SOC_range(i-1));
end
dOCV_dSOC(1) = (z.OCV_SOC(2) - z.OCV_SOC(1)) / (z.SOC_range(2) - z.SOC_range(1));
dOCV_dSOC(n) = (z.OCV_SOC(n) - z.OCV_SOC(n-1)) / (z.SOC_range(n) - z.SOC_range(n-1));
H = [-1, -1, -1, interp1(z.SOC_range, dOCV_dSOC, x(4), 'linear', 'extrap')];

% ---- predict
x_hat = f(x);            P = F*P*F' + Q;
y_hat = h(x_hat);        error = V - y_hat;
% ---- update
S = H*P*H' + R;          K = P*H' / S;
x_pred = x_hat + K*error;
P = (eye(4) - K*H) * P;

SOC_Pred = x_pred(4);
z.P = P;  z.x = x_pred;

% re-interpolate ECM parameters when SOC has moved by more than 2 %
if abs(SOC_Pred - z.Param.SOC_now) > 0.02
    z.R0 = interp1(z.Param.SOC, z.Param.R0, SOC_Pred, 'linear', 'extrap');
    z.R1 = interp1(z.Param.SOC, z.Param.R1, SOC_Pred, 'linear', 'extrap');
    z.R2 = interp1(z.Param.SOC, z.Param.R2, SOC_Pred, 'linear', 'extrap');
    z.R3 = interp1(z.Param.SOC, z.Param.R3, SOC_Pred, 'linear', 'extrap');
    z.C1 = interp1(z.Param.SOC, z.Param.T1, SOC_Pred, 'linear', 'extrap') / z.R1;
    z.C2 = interp1(z.Param.SOC, z.Param.T2, SOC_Pred, 'linear', 'extrap') / z.R2;
    z.C3 = interp1(z.Param.SOC, z.Param.T3, SOC_Pred, 'linear', 'extrap') / z.R3;
    z.Param.SOC_now = SOC_Pred;
end
end`,
    codeNote: "Lightly reformatted from the shipped file; logic unchanged.",
    spec: { kind: "ecm", rcPairs: 3, states: ["V₁", "V₂", "V₃", "SOC"], filter: "EKF" },
    strengths: ["Self-correcting: recovers from wrong initial SOC and sensor offset", "Physically interpretable parameters from HPPC", "Moderate compute — runs on a BMS microcontroller"],
    weaknesses: ["Accuracy limited by ECM fidelity, especially below 0 °C", "Needs Q/R tuning per temperature", "Flat OCV region (mid-SOC) gives weak voltage feedback"],
    complexity: 8,
  },
  {
    slug: "fnn",
    name: "Example 3 — Feedforward neural network",
    modelType: "FNN",
    tagline: "Two ReLU layers on 300-sample averaged inputs; weights pasted straight from the trained net.",
    description: [
      "A small feedforward network (3 → 23 → 18 → 1, ReLU) maps normalised current, voltage and temperature to SOC. To give it some memory without recurrence, each input is the mean over the last 300 samples; the rolling window is stored in z and seeded by replicating the first sample.",
      "The network was exported from MATLAB's training tools by writing the weights, biases and min-max normalisation constants into the file, so the estimator needs no toolbox at run time. This is the pattern to copy for any trained model.",
    ],
    files: [{ name: "Model.m", note: "estimator with embedded weights (IW1_1, LW2_1, LW3_2, biases)" }, { name: "Settings.xlsx", note: "legacy metadata — not required by this site" }],
    code: `% SOC Estimation Example V2 — Feedforward NN (3 → 23 → 18 → 1, ReLU)
function [y1, z] = Model(x1, z)
if nargin < 2
    z = repmat(x1, 300, 1);       % seed a 300-sample window with the first sample
    x1 = x1';
else
    z = [z(2:300, :); x1];        % slide the window
    x1 = mean(z)';                % averaged [I; V; T] as network input
end

% Input normalisation (from training)
x1_step1.xoffset = [-9.6462010537939; 2.63342918099023; -21.353];
x1_step1.gain    = [0.129061466569397; 1.1238956119858; 0.027994663883052];
x1_step1.ymin    = -1;

% Layer 1 (23 neurons) — weights exported from the trained network
b1    = [ ... 23 x 1 ... ];
IW1_1 = [ ... 23 x 3 ... ];
% Layer 2 (18 neurons)
b2    = [ ... 18 x 1 ... ];
LW2_1 = [ ... 18 x 23 ... ];
% Layer 3 (output)
b3    = -0.59133424287317581935;
LW3_2 = [ ... 1 x 18 ... ];

% Output de-normalisation
y1_step1.ymin = -1;  y1_step1.gain = 2.00515437730162;  y1_step1.xoffset = 0.0120263568795789;

% ===== SIMULATION =====
Q   = size(x1, 2);
xp1 = mapminmax_apply(x1, x1_step1);
a1  = poslin_apply(repmat(b1, 1, Q) + IW1_1 * xp1);
a2  = poslin_apply(repmat(b2, 1, Q) + LW2_1 * a1);
a3  = repmat(b3, 1, Q) + LW3_2 * a2;
y1  = mapminmax_reverse(a3, y1_step1);
end

function y = mapminmax_apply(x, s)
  y = bsxfun(@plus, bsxfun(@times, bsxfun(@minus, x, s.xoffset), s.gain), s.ymin);
end
function a = poslin_apply(n, ~)
  a = max(0, n);  a(isnan(n)) = nan;          % ReLU
end
function x = mapminmax_reverse(y, s)
  x = bsxfun(@plus, bsxfun(@rdivide, bsxfun(@minus, y, s.ymin), s.gain), s.xoffset);
end`,
    codeNote: "Weight matrices elided for readability — the shipped file contains the full numeric arrays.",
    spec: { kind: "fnn", layers: [3, 23, 18, 1], activation: "ReLU", inputs: ["Ī", "V̄", "T̄"], window: 300 },
    strengths: ["Learns non-linear temperature effects directly from data", "Cheap inference (two small matrix products)", "No battery model or parameter fitting needed"],
    weaknesses: ["Only as good as the training coverage — new cell / cycles hurt", "Averaging window lags fast transients", "No physical constraint: can produce jumpy estimates"],
    complexity: 4,
  },
  {
    slug: "lstm",
    name: "Example 4 — LSTM recurrent network",
    modelType: "LSTM",
    tagline: "A 10-unit LSTM stepped one sample at a time with hand-written gate equations.",
    description: [
      "The recurrent estimator from the ITEC 2022 paper family: inputs are normalised voltage, current and temperature; a single LSTM layer with 10 hidden units feeds a fully-connected output clipped to 0–1. Hidden and cell states live in z, so the network sees the whole history through its memory rather than an explicit window.",
      "Because toolboxes are not available inside the evaluator, the LSTM step (input/forget/cell/output gates) is implemented explicitly with the exported weight matrices. Training scripts for this model are in 3-Neural Network Training Example.zip.",
    ],
    files: [{ name: "Model.m", note: "estimator with embedded lstmWeights, lstmRecurrentWeights, lstmBias, fcWeights" }, { name: "Settings.xlsx", note: "legacy metadata — not required by this site" }],
    code: `% SOC Estimation Example V2 — LSTM (10 units) — McMaster University 2024
function [Y_est, z] = Model(X, z)

% Normalise inputs to the training ranges: [V, I, T]
MAX = [15,  4.5, 51 ];
MIN = [-19, 2.5, -27];
inputSample(1) = (X(2) - MIN(2)) / (MAX(2) - MIN(2));   % voltage
inputSample(2) = (X(1) - MIN(1)) / (MAX(1) - MIN(1));   % current
inputSample(3) = (X(3) - MIN(3)) / (MAX(3) - MIN(3));   % temperature

if nargin < 2                                  % ---- initialise network + state
    initState.HiddenState = zeros(10, 1);
    initState.CellState   = zeros(10, 1);
    z.lstmWeights          = [ ... 40 x 3  ... ];   % [input; forget; cell; output] gates
    z.lstmRecurrentWeights = [ ... 40 x 10 ... ];
    z.lstmBias             = [ ... 40 x 1  ... ];
    z.fcWeights            = [ ... 1 x 10  ... ];
    z.fcBias               = 1.0632563;
    z.activationMin = 0;  z.activationMax = 1;    % clipped ReLU on the output
    z.prevState = initState;
end
[Y_est, z.prevState] = singleSamplePredict(z, inputSample);

    function [predictedOutput, newState] = singleSamplePredict(z, inputSample)
        gates = z.lstmWeights * inputSample' + z.lstmRecurrentWeights * z.prevState.HiddenState + z.lstmBias;
        n = numel(gates) / 4;
        inputGate  = sigmoid(gates(1:n));
        forgetGate = sigmoid(gates(n+1:2*n));
        cellGate   = tanh(   gates(2*n+1:3*n));
        outputGate = sigmoid(gates(3*n+1:end));

        newCellState   = forgetGate .* z.prevState.CellState + inputGate .* cellGate;
        newHiddenState = outputGate .* tanh(newCellState);

        fcOutput = z.fcWeights * newHiddenState + z.fcBias;
        predictedOutput = max(z.activationMin, min(z.activationMax, fcOutput));

        newState.HiddenState = newHiddenState;
        newState.CellState   = newCellState;
    end
    function y = sigmoid(x)
        y = 1 ./ (1 + exp(-x));
    end
end`,
    codeNote: "Weight matrices elided for readability — the shipped file contains the full numeric arrays.",
    spec: { kind: "rnn", cell: "LSTM", units: 10, inputs: ["V", "I", "T"], output: "clipped ReLU" },
    strengths: ["Memory of the full history — no explicit window", "Recovers from initial-SOC error as the state settles", "Best accuracy of the four examples across temperatures"],
    weaknesses: ["Needs careful training on the open cycles", "Higher compute per step than FNN", "Behaviour outside the training envelope is unpredictable"],
    complexity: 5,
  },
];

export const EXAMPLE_BY_SLUG = Object.fromEntries(EXAMPLES.map((e) => [e.slug, e])) as Record<string, ExampleModel>;
