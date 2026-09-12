## 5. The evaluation engine — running the model

> 💡 **Plain English.** This and the next part describe the ~800 lines of Python that *are* the benchmark. They reproduce the lab's original MATLAB scoring tool exactly — checked against the real hidden data: the four reference models match every column of the old leaderboard to three decimal places, and the Python and MATLAB paths agree with each other. This part is about *running* the model: what data it is fed, in what order, and how. The next part is about turning the errors into a score.

Directory: [evaluator/python/socbench_eval/](../../evaluator/python/socbench_eval/) — `__main__.py` (the run), `data.py` (load the .mat), `runner.py` (execute models), `pipeline.py` (jobs, scoring, complexity, traces).

### 🔐 The answer key: `blind_data.mat`

The lab's data lives in MATLAB *tables*, which Python cannot read. [Export_Blind_Data.m](../../matlab/Export_Blind_Data.m) is run **once** to convert them to plain arrays in a version-7 `.mat` that scipy understands. **The cycle order is preserved and load-bearing** — every grouping in the scorer is positional, exactly as the original tool relied on.

```mermaid
flowchart TB
    F["blind_data.mat"] --> B["blind.cells(k), k = 1…4<br/>m80 · m448 · m448N · m1000"]
    B --> CY["cycle(i) — in file order, which is load-bearing"]
    CY --> FLD["<b>name</b>  UDDS, LA92, HWCUST1, CC_CV_charge, Other …<br/><b>tempC</b>  −20 · −10 · 0 · 10 · 25 · 40<br/><b>isTest</b>  false for Other and charge cycles<br/><b>isCharge</b><br/><b>I, V, T, SOC</b>  1 Hz column vectors"]
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class F danger
    class B,CY,FLD data
```

### 🚗 The test grid

Every model faces the same grid. Each square is one drive cycle of roughly one to three hours of one-second measurements.

```mermaid
flowchart TB
    C["<b>4 cells</b><br/>m80 — 80 kg payload<br/>🔐 m448 — 448 kg, fully blinded<br/>m448N — 448 kg, open data exists<br/>m1000 — 1000 kg, highest currents"]
    T["<b>× 6 temperatures</b><br/>−20 · −10 · 0 · 10 · 25 · 40 °C"]
    Y["<b>× 6 drive cycles</b><br/>standard: UDDS · HWFET · LA92 · US06<br/>non-standard: HWCUST · HWGRADE"]
    TOT["= <b>144</b> test cycles<br/>+ CC-CV charging cycles"]
    C --> T --> Y --> TOT
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class C,T,Y data
    class TOT web
```

### ▶️ The run, in order (`__main__.py`)

```mermaid
flowchart TB
    A["safe_extract the zip<br/>(same limits as the website)"] --> B{"Model.py present?"}
    B -- yes --> PB["PythonBackend"]
    B -- no --> MB["MatlabBackend"]
    PB --> V
    MB --> V["<b>Validation job</b><br/>m80 UDDS at 10 °C, +0.3 A on the current, 1-minute pad<br/>crash here → fail fast with code VALIDATION"]
    V --> J["build_jobs: the full batch (next diagram)"]
    J --> R["backend.run(jobs)<br/>every matrix through the model, once per sample"]
    R --> S["score · complexity · per_cycle_rows · robustness_traces"]
    S --> O["results.json"]
    S --> O2["traces.mat (best effort)"]
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class A,B,PB,MB,J,R,S sandbox
    class V danger
    class O,O2 data
```

The validation job exists for one reason: a broken model fails in seconds with its real error message instead of after 45 minutes.

### 🧾 What `build_jobs` produces

```mermaid
flowchart TB
    subgraph CYC["🚗 Drive and charge cycles"]
        A["4 cells × every cycle in the file<br/>= 144 test cycles + charge cycles + 'Other'<br/>key  cycle:cell:i"]
    end
    subgraph ISOC["Test 10 — wrong initial SOC (9 jobs)"]
        B["m80: LA92 @ 25 °C, US06 @ −10 °C,<br/>US06 @ 10 °C — each started where the<br/>true SOC is already below 90 / 60 / 30 %<br/>key  isoc:b:q:idx"]
    end
    subgraph OFF["Test 11 — current-sensor offset (18 jobs)"]
        C["m1000: US06 @ −10 °C, HWFET @ 10 °C,<br/>LA92 @ 40 °C — with −0.3, −0.1, −0.05,<br/>+0.05, +0.1, +0.3 A added to the current<br/>key  offset:b:j"]
    end
    A ~~~ B ~~~ C
    A --> BATCH["one batch, run in one pass"]
    B --> BATCH
    C --> BATCH
    style CYC fill:#E3F0F5,stroke:#0D5D78
    style ISOC fill:#FFF3D6,stroke:#B8860B
    style OFF fill:#FFF3D6,stroke:#B8860B
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class A data
    class B,C worker
    class BATCH sandbox
```

Only the ±0.3 A offset runs enter the score; the others are kept for the RMSE-vs-offset chart.

**Padding.** Every job is prefixed with one hour (3 600 samples) of its first row repeated, so estimators with internal memory — Kalman filters, RNNs — settle before scoring begins. The pad is stripped from the prediction before metrics.

```mermaid
flowchart LR
    P["3600 samples of the first row<br/>(current forced to 0 A for initial-SOC jobs)"] --> D["the actual cycle"] --> M["metrics computed<br/>on this part only"]
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class P ext
    class D data
    class M web
```

### 🔋 How the model is executed (`runner.py`)

Both backends honour the same contract: **call `Model(X[i], z)` once per sample, in order, carrying `z` forward.** That is how a BMS runs an estimator, and it is why a model cannot cheat by looking ahead.

```mermaid
sequenceDiagram
    participant E as 🧮 Evaluator
    participant M as 🔋 Model

    E->>M: Model(X[0])
    M-->>E: soc0, z
    E->>M: Model(X[1], z)
    M-->>E: soc1, z
    E->>M: Model(X[2], z)
    M-->>E: soc2, z
    Note over E,M: N samples → N calls — z is always the model's own memory
```

This is what a submitted model looks like — the reference Coulomb counter, in full:

```python
# Model.py
CAPACITY_AH = 4.6

def Model(X, z=None):
    """X = [current (A, negative = discharge), voltage (V), temperature (C)]
    Returns (SOC estimate 0..1, memory z for the next call)."""
    current = float(X[0])
    if z is None:                      # first sample: assume fully charged
        soc = 1.0
    else:
        soc = float(z) + current * (1 / 3600) / CAPACITY_AH
    return soc, soc                    # memory z = previous SOC
```

| Backend | How | Errors |
|---|---|---|
| `PythonBackend` | imports `Model.py` with `importlib`, loops in-process | re-raised as `ModelError` with the traceback trimmed to the submitter's own frames |
| `MatlabBackend` | writes every input matrix to one `in.mat`, starts **one** `matlab -batch` session running [Run_Model.m](../../matlab/Run_Model.m) (40 lines: loop over matrices, `tic/toc` around each), reads `out.mat` back | "Undefined function 'butter'" is translated to "that is the Signal Processing Toolbox, not installed here" via a lookup table |

`Run_Model.m` prints `[Run_Model] k/n done` after every matrix; the Python side turns that into the same `NN.N% | key` progress lines the Python backend emits, so the website's progress bar is identical for both. Progress is weighted by *samples*, not matrix count, so long cycles move the bar proportionally.

### 🧪 Dry run and mock

`--dry-run` uses **open** data shipped with the repo (`dryrun_data.mat`, 2 h of public m80 data): the +0.3 A validation, then one padded cycle. No blinded data is mounted, no leaderboard row. This replaced the lab's downloadable "Model Submission Test Tool".

`EVALUATOR=mock` ([mock-evaluator.ts](../../src/evaluator/mock-evaluator.ts)) fabricates plausible numbers from a seeded random generator — per-family baselines (LSTM ≈ 2.6 %, EKF ≈ 9 %, Coulomb counter ≈ 30 %) with temperature, cycle and cell factors — deterministically, so the same submission always "evaluates" identically. It exists so the entire website can be developed with no blinded data and no Docker.

📌 **Files to open, in order:** [__main__.py](../../evaluator/python/socbench_eval/__main__.py) → [data.py](../../evaluator/python/socbench_eval/data.py) → [runner.py](../../evaluator/python/socbench_eval/runner.py) → [Run_Model.m](../../matlab/Run_Model.m) → [Export_Blind_Data.m](../../matlab/Export_Blind_Data.m).

