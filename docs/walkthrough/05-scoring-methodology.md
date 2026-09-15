<a id="part-5"></a>
## 5. Scoring methodology

> **In this chapter.** The model interface, the composition of the evaluation set, the aggregation of per-cycle errors into eighteen test cases and one weighted score, and the two auxiliary quantities reported alongside it.

The evaluator is approximately 800 lines of Python. It reimplements the laboratory's original MATLAB blind-modelling tool and reproduces its results to three decimal places on the reference models.

### 5.1 The model interface

A model is a single function invoked once per sample, in the same manner as an estimator running on a vehicle's battery controller. At each call it receives the current, voltage and temperature for that sample together with whatever state it returned from the previous call, and it returns its estimate and the state to carry forward. It has no access to future samples. The simplest admissible model, a Coulomb counter that integrates current over the rated capacity, is four lines:

```python
def Model(X, z=None):          # X = [current, voltage, temperature]
    current = float(X[0])
    soc = 1.0 if z is None else float(z) + current / 3600 / 4.6
    return soc, soc            # (estimate in 0..1, state for the next call)
```

Python models are imported and iterated in-process. MATLAB models are executed through a single `matlab -batch` session running a forty-line driver script whose only function is the same iteration. Both paths produce identical scores, verified against the four reference models.

### 5.2 The evaluation set

![Figure 5.1. The evaluation grid. Four cells, six temperatures and six drive cycles give 144 test cycles; the m448 row is the withheld cell.](figures/fig-testgrid.png)

Before each cycle, one hour of its first sample is prepended as **padding**, so that filters and recurrent networks (models that carry state from one sample to the next) reach steady state before the scored portion begins; the padding is excluded from all metrics. A short **validation run** on one cycle precedes the full evaluation, so that a defective model fails within seconds rather than after forty-five minutes. In total an evaluation comprises 195 runs: the 144 drive cycles, the charging profiles, and 27 robustness runs.

### 5.3 From per-cycle errors to one score

![Figure 5.2. The scoring pipeline. Each drive cycle yields one RMSE; the RMSEs are grouped into eighteen test cases; the test cases are weighted and summed.](figures/fig-pipeline.png)

The weights are published and fixed, and they sum to one:

- Seven categories carry a weight of 0.1 each: the withheld cell, the open cells, charging, standard cycles, non-standard cycles, the initial-SOC perturbation and the current-offset perturbation.
- The four payload conditions together carry 0.2.
- The six temperatures together carry 0.1.
- The all-cells case is reported on every scorecard but carries a weight of zero, since every other case is a subset of it and a non-zero weight would count each cycle twice.

![Figure 5.3. The eighteen test cases and their weights. Robustness and generalisation are weighted as heavily as raw accuracy.](figures/fig-weights.png)

### 5.4 Auxiliary quantities

**Complexity** is reported on a scale from 1 to 10 and addresses the question of whether a model could run on an embedded battery controller. It is the model's execution time per sample relative to a Coulomb counter measured on the same machine in the same language. It is displayed on the leaderboard but has no effect on ranking.

A **suspicious** flag is raised when the mean error exceeds 25 %. The original tool suppressed such results; this implementation records them for review by an administrator.

### 5.5 Outputs

Four artefacts leave the sandbox and are written to the database and object storage:

- the eighteen metrics and the weighted score,
- one record per cycle with its RMSE, mean absolute error and maximum error,
- down-sampled traces of thirteen representative cycles, the robustness runs and the model's worst cycle, down-sampled by a method that preserves every extremum so that the plotted trace always agrees with the reported maximum error,
- a 6 MB `.mat` file containing every run at full resolution.

**Files to open:** [pipeline.py](../../evaluator/python/socbench_eval/pipeline.py) (`score`, `complexity`) → [runner.py](../../evaluator/python/socbench_eval/runner.py) → [Run_Model.m](../../matlab/Run_Model.m) → [test-cases.ts](../../src/lib/test-cases.ts).

