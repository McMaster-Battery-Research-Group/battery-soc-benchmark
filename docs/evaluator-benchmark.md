# Evaluator benchmark (16 September 2026)

Four reference models, each as a MATLAB and a Python package, evaluated through six configurations on one laptop (Windows 11, MATLAB R2026a, Python 3.14, the withheld dataset). One repeat per cell. **Every configuration produced identical results: all 18 test-case metrics and the weighted error agree to three decimals for every model.** The decision therefore turns on cost alone.

| | Model → scorer | Mechanism |
|---|---|---|
| **A** | MATLAB → Python | what runs today |
| **B** | Python → Python | what runs today |
| **C** | MATLAB → MATLAB | one MATLAB script, native |
| **D** | Python → MATLAB | py. bridge, in-process |
| **E** | Python → MATLAB | one runner process |
| **F** | Python → MATLAB | one process per matrix |

## Wall time per evaluation (seconds)

| Model | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Coulomb counter | 10 | 9 | 4 | 537 | 18 | 87 |
| EKF | 174 | 266 | 171 | 1065 | 318 | 353 |
| FNN | 150 | 83 | 132 | 791 | 105 | 170 |
| LSTM | 132 | 151 | 122 | 925 | 181 | 230 |

## Complexity bin (time per sample, per-language calibration)

| Model | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Coulomb counter | 1 | 1 | 1 | 7 | 2 | 5 |
| EKF | 10 | 6 | 10 | 8 | 6 | 6 |
| FNN | 9 | 4 | 9 | 7 | 5 | 6 |
| LSTM | 9 | 5 | 9 | 8 | 5 | 6 |

## Time per sample (seconds, model loop only)

| Model | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Coulomb counter | 7.4e-08 | 2.0e-06 | 6.9e-08 | 1.2e-04 | 2.1e-06 | 2.4e-05 |
| EKF | 3.8e-05 | 6.2e-05 | 3.9e-05 | 2.5e-04 | 7.2e-05 | 8.6e-05 |
| FNN | 3.3e-05 | 1.9e-05 | 3.0e-05 | 1.8e-04 | 2.2e-05 | 4.3e-05 |
| LSTM | 2.9e-05 | 3.5e-05 | 2.7e-05 | 2.1e-04 | 4.0e-05 | 5.8e-05 |

## Weighted error (identical across configurations)

| Model | Weighted error |
|---|---|
| Coulomb counter | 15.366 |
| EKF | 5.044 |
| FNN | 4.269 |
| LSTM | 2.726 |

## Reading the numbers

- **E is the mirror of A.** For a Python package, one MATLAB scorer plus one Python runner costs 20–50 s more than the pure-Python evaluator (B): MATLAB's start-up and the two files. It lands in the same complexity bin as B or one above. This is the configuration the C + E proposal uses.
- **C matches A.** Both run the same native MATLAB loop; the scorer's language makes no measurable difference to a MATLAB package.
- **The bridge (D) is 5–60× slower** than every other route and its time-per-sample is dominated by the MATLAB↔Python conversion on each of the 1.4 million calls, so its complexity bin is not the model's. It is not a viable path.
- **Per-cycle subprocesses (F)** add 60–90 s of interpreter start-ups per evaluation and inflate the bin by one. This was the original tool's behaviour.
- **Calibration.** The same model lands in different bins by language (EKF: 10 in MATLAB, 6 in Python; FNN: 9 versus 4). Both constants were set so that a plain Coulomb counter lands in bin 2 on the evaluation host; the MATLAB constant is now too small for this machine (the Coulomb counter lands in bin 1). Re-measure both constants on the production VM before comparing bins across languages, or report complexity per language.
- **A defect found on the way.** The FNN and LSTM Python example packages indexed a lazily loaded `weights.npz` inside `Model()`, re-reading the archive on every sample; the FNN took 39 minutes through Python. Fixed in both packages and on the examples page (`W = dict(np.load(...))`); the corrected packages are what the table shows.

## Reproducing

```
python scripts/bench-evaluators.py --data blind-data/blind_data.mat --out bench-out --models cc,ekf,fnn,lstm --configs A,B,C,D,E,F
python scripts/bench-report.py bench-out/results.csv docs/evaluator-benchmark.md bench-out/report.html
```

Configurations C–F run `matlab/Evaluate_Submission.m` (with `matlab/socbench_runner.py` for Python packages); A and B run `evaluator/python/socbench_eval`. Raw per-run output, logs and `results.json` files are in the benchmark output folder (not committed).
