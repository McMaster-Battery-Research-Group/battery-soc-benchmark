<a id="part-5"></a>
## 5. 🧮 The evaluation engine — scoring, complexity and outputs

> 💡 **Plain English.** After the model has run on every cycle, the evaluator has one error number per cycle. This part shows how those become the 18 numbers on the scorecard, how the 18 become one leaderboard score, what "complexity" means, and what gets sent back to the website for the charts.

### 📊 From one number per cycle to 18 metrics

Per-cycle RMSE (in % SOC) is arranged as a matrix `R` — rows are test cycles in file order, columns are the four cells — and the metrics are positional means over it, mirroring the original `Obtain_Output_Data.m`.

```mermaid
flowchart TB
    R["<b>Matrix R</b> — per-cycle RMSE<br/>rows = test cycles in file order<br/>columns = m80 · m448 · m448N · m1000"]
    X["<b>the other runs</b><br/>charge-cycle RMSEs<br/>9 initial-SOC RMSEs<br/>18 offset RMSEs"]
    G["<b>Positional means → 18 metrics</b><br/>1 allCells — mean of non-zero R (weight 0)<br/>2 blindedCell — the m448 column<br/>3 nonBlindedCells — mean of the other three<br/>4 charging — the charge cycles<br/>5–8 mass m80 / m448 / m448N / m1000<br/>— the four column means<br/>9 standard vs non-standard cycles<br/>— blocks of 4 and 2<br/>10 six temperatures — m80 in blocks of 6<br/>(−10 and −20 swapped)<br/>11 initialSocError — 3 : 2 : 1 for 90 / 60 / 30 %<br/>12 currentSensorOffset — mean of the ±0.3 A runs"]
    W["<b>weighted error</b> = Σ weight × metric<br/>weights sum to exactly 1"]
    R --> G
    X --> G
    G --> W
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class R data
    class X worker
    class G,W web
```

### ⚖️ The weights

```mermaid
%%{init: {"theme": "base", "themeVariables": {"pie1": "#7A003C", "pie2": "#9E3D67", "pie3": "#C27A99", "pie4": "#FDBF57", "pie5": "#E5A93E", "pie6": "#C99027", "pie7": "#B8860B", "pie8": "#0D5D78", "pie9": "#3A7F98", "pie10": "#7FB0C4", "pie11": "#0E5B3D", "pie12": "#4E8A6A", "pieStrokeColor": "#ffffff", "pieSectionTextColor": "#ffffff"}}}%%
pie showData title Share of the weighted error, by test case
    "2 Blinded cell" : 6
    "3 Non-blinded cells" : 6
    "4 Charging" : 6
    "9 Standard cycles" : 6
    "9 Non-standard cycles" : 6
    "10 Wrong initial SOC" : 6
    "11 Sensor offset" : 6
    "5 Mass m80" : 2
    "5 Mass m448" : 4
    "6 Mass m448N" : 4
    "5 Mass m1000" : 2
    "9 Six temperatures, 1/60 each" : 6
```

The weights in metric order: `[0, 1/10, 1/10, 1/10, 1/30, 2/30, 2/30, 1/30, 1/10, 1/10, 1/60 ×6, 1/10, 1/10]`. Seven categories carry a tenth each; the four payloads share a fifth; the six temperatures share a tenth. `allCells` has weight zero — it is the headline number people recognise from the paper, but it would double-count everything else.

**A worked example.** A model with these RMSEs (all in % SOC): blinded cell 3.0, non-blinded 2.0, charging 4.0, standard 2.5, non-standard 3.5, initial-SOC 5.0, offset 6.0, the four masses 2.0 / 2.5 / 3.0 / 4.0, the six temperatures 6, 4, 3, 2, 1.5, 1.5:

| Group | Contribution |
|---|---|
| Seven categories at 1/10 | 0.1 × (3.0 + 2.0 + 4.0 + 2.5 + 3.5 + 5.0 + 6.0) = **2.60** |
| Four masses at 1/30, 2/30, 2/30, 1/30 | (2.0 + 2×2.5 + 2×3.0 + 4.0) / 30 = **0.57** |
| Six temperatures at 1/60 | (6 + 4 + 3 + 2 + 1.5 + 1.5) / 60 = **0.30** |
| **Weighted error** | **3.47** |

Two extras the scorer emits: `suspicious = mean(R) > 25` (the original tool *withheld* such results; we flag it in the log and leave the decision to an administrator), and `maxError` = the single worst instantaneous error across all test cycles.

### 📏 RMSE, in words

For one cycle: take the difference between the estimated and true SOC at every second, square each difference (so misses in both directions count and big misses count more), average them, and take the square root to get back to % SOC. A model that is always 2 % off scores an RMSE of 2. A model that is perfect most of the time but 30 % off for a minute scores worse than that minute's share would suggest — which is the point.

### ⏱️ Complexity

```mermaid
flowchart TB
    A["mean seconds per sample<br/>over the cycle jobs"] --> B["÷ calibration constant for this runtime<br/>SOCBENCH_CAL_PYTHON / _MATLAB"]
    B --> C["ratio"]
    C --> D["how many times does it exceed 10^(1/3) ≈ 2.15?"]
    D --> E["bin 1–10<br/>(a Coulomb counter lands in 2)"]
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class A,B,C,D sandbox
    class E web
```

Informational only — it never enters the weighted error. The constants are per evaluation host. A caveat worth knowing: MATLAB's JIT is ~20× faster inside a function than in a script, so the MATLAB constant can only be re-measured by calling the model the way `Run_Model.m` does. For a researcher, complexity answers "would this fit on a real battery controller?" — a bin of 2 is a few arithmetic operations per second; a bin of 9 is a neural network that would need a much larger processor.

### 📤 What leaves the engine

```mermaid
flowchart TB
    subgraph RJ["results.json → the database row"]
        A["18 metrics + weightedError + maxError + complexity"]
        B["perCycle — one row per test cycle:<br/>RMSE, MAE, max error, duration"]
        C["timeSeries — ~240-point <b>peak-preserving</b> down-samples<br/>of 13 illustrative cycles, the 9 initial-SOC runs,<br/>the ±0.3 A offset runs, and the model's own worst cycle<br/>each with a plain-English note"]
        D["robustness — the raw 9 + 18 RMSEs behind tests 10–11"]
    end
    subgraph TM["traces.mat → the bucket"]
        E["every run at full 1 Hz, int16 hundredths of a percent<br/>~6 MB, scipy-readable, for the raw curves"]
    end
    style RJ fill:#E3F0F5,stroke:#0D5D78
    style TM fill:#E3F0F5,stroke:#0D5D78
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class A,B,C,D,E data
```

**Peak-preserving down-sampling.** A three-hour cycle has 10 800 points; a chart can show about 240. Taking every 45th point would hide the very spike that produced the max-error number. Instead `display_indices` splits the cycle into 120 buckets and keeps the sample with the largest *and* the smallest signed error in each — so every spike survives and the plotted line agrees with the scorecard.

```mermaid
flowchart TB
    F["10 800 samples"] --> B["120 buckets of 90"]
    B --> K["keep max-error and min-error<br/>sample in each bucket + both ends"]
    K --> O["≈ 240 points, every spike intact"]
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class F,B,K data
    class O web
```

📌 **Files to open, in order:** [pipeline.py](../../evaluator/python/socbench_eval/pipeline.py) (`score`, `complexity`, `display_indices`, `per_cycle_rows`, `robustness_traces`, `write_full_traces`) → [test-cases.ts](../../src/lib/test-cases.ts) (the same 18 with labels and descriptions for the website).

