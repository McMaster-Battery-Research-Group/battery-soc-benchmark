<a id="part-5"></a>
## 5. How the score is computed

> **In this chapter.** Inside the sandbox: what the model is asked to do, exactly what data it is run on, how 144 errors become 18 test cases and one score, and the two extra numbers that come out alongside it.

This is the roughly 800 lines of Python that *are* the benchmark. They reproduce the lab's original MATLAB tool to three decimal places on the reference models.

### 5.1 What the model is asked to do

A model is one function, called once per second of data, exactly the way a car's battery computer would call it. It receives the current, voltage and temperature for that second and whatever memory it handed back last time, and it returns its estimate and the memory for the next call. It cannot look ahead. The simplest possible model, a Coulomb counter that just adds up the current, is four lines:

```python
def Model(X, z=None):          # X = [current, voltage, temperature]
    current = float(X[0])
    soc = 1.0 if z is None else float(z) + current / 3600 / 4.6
    return soc, soc            # (estimate 0..1, memory for the next call)
```

Python models are imported and looped in-process. MATLAB models run through one `matlab -batch` session executing a forty-line script that does nothing but loop. Both produce identical scores, verified on the four reference models.

### 5.2 What it is run on

![Figure 5.1. The test grid. Four cells, six temperatures and six drive cycles make 144 test cycles; the m448 row is the hidden cell.](figures/fig-testgrid.png)

Before each cycle, one hour of its first sample is repeated as **padding**, so that filters and recurrent neural networks (models that carry memory from one sample to the next) have settled before the scored part begins; the padding is excluded from the metrics. A short **validation run** on one cycle goes first, so a broken model fails in seconds instead of after forty-five minutes.

### 5.3 From errors to one number

![Figure 5.2. The scoring pipeline. Each drive cycle gives one RMSE; the RMSEs are grouped into eighteen test cases; the test cases are weighted and added.](figures/fig-pipeline.png)

The weights are published and fixed, and they sum to one. Seven categories carry a tenth each: the hidden cell, the open cells, charging, standard cycles, non-standard cycles, the wrong-initial-SOC sweep and the sensor-offset sweep. The four payloads together carry a fifth, and the six temperatures together carry a tenth. "All cells" is shown on every scorecard but weighs nothing, because every other test is a subset of it and it would count everything twice.

![Figure 5.3. The eighteen test cases and their weights. Robustness and generalisation count as much as raw accuracy.](figures/fig-weights.png)

### 5.4 Two more numbers

**Complexity** is a bin from 1 to 10 that answers "would this fit on a real battery controller?" It is the model's time per sample relative to a plain Coulomb counter measured on the same machine in the same language. It is shown on the leaderboard but never affects rank.

A **suspicious** flag is raised when the mean error exceeds 25 %. The original tool hid such results; this one logs them for an administrator to look at.

### 5.5 What goes back to the website

The eighteen metrics and the score; one row per cycle with its RMSE, mean absolute error and maximum error; down-sampled traces of thirteen illustrative cycles, the robustness runs and the model's own worst cycle (down-sampled so that every spike survives, so the chart always agrees with the max-error number); and a 6 MB `.mat` file of every run at full resolution for anyone who wants the raw curves.

**Files to open:** [pipeline.py](../../evaluator/python/socbench_eval/pipeline.py) (`score`, `complexity`) → [runner.py](../../evaluator/python/socbench_eval/runner.py) → [Run_Model.m](../../matlab/Run_Model.m) → [test-cases.ts](../../src/lib/test-cases.ts).

