# How the new evaluator differs from the original Standardized Evaluation Tool

A line-by-line comparison of the lab's MATLAB **Standardized Evaluation Tool** (Atjen von Liebenstein 2024, as last run by Ahnaf — folder *Blind Model Files/Standardized Evaluation Tool (Ahnaf)*, with notes where the original *Server* version differs) against the benchmark's evaluator (`evaluator/python/socbench_eval`, `matlab/Run_Model.m`) and the web platform around it. Written 2026-08-29 from the source of both.

Legend: **Same** = numerically identical by construction (and verified: the CC / EKF / FNN / LSTM example packages score identically on all 20 columns on both systems). **Changed** = behaves differently — read these. **New** = did not exist in the old tool. **Dropped** = the old tool did it, we do not.

## 1. What is scored — the numbers (all Same)

| Item | Original tool | New evaluator | Status |
| --- | --- | --- | --- |
| Blinded data | `Data_m80/m448/m448N/m1000.mat` (MATLAB tables) | The same four files exported once by `matlab/Export_Blind_Data.m` into one numeric `blind_data.mat` (double precision, same cycle order, `isTest` = not *Other* and not *CC_CV_charge*) | Same data, different container |
| Model inputs | `Inputs = {'Current','Voltage','Battery_Temp_degC'}` → X columns I, V, T | `INPUT_ORDER = ("I","V","T")` | Same |
| Padding | 3600 samples of the first row prepended to every cycle; prediction rows 1–3600 discarded | `PAD_SAMPLES = 3600`, same construction, same discard | Same |
| Per-sample call | `[y(1),z] = Model(X(1,:)); [y(i),z] = Model(X(i,:), z)` | `Run_Model.m` — identical loop; Python: `Model(X[0])` then `Model(X[i], z)` (same as `PythonModelRunner.py`) | Same |
| NaN in prediction | `SOC_Pred(isnan) = 0` after the cut | `np.where(isnan, 0)` after the cut (MATLAB path); Python path raises on NaN/Inf like `PythonModelRunner.py` did | Same |
| Cycles run | Every cycle in each file, including *Other* and *CC_CV_charge* | `build_jobs` runs every cycle | Same |
| Per-cycle metrics | RMSE, MAE, MAXE in % SOC over the un-padded cycle; *Other* excluded from the tables; charge cycles only feed test 4 | Same formulas, same exclusions | Same |
| Tests 1–8 | means of the zero-padded RMSE matrix exactly as `Process_Submission.m` (`nonzeros`, blinded column filtered by `~=0`, standard = rows 1–4 of each 6-block, custom = rows 5–6) | Ported line for line (`score()` in `pipeline.py`) | Same |
| Test 9 | m80 column, blocks of 6 in file order, first two swapped (−10/−20) | Same | Same |
| Test 10 | m80 LA92 25 °C, US06 −10 °C, US06 10 °C restarted where SOC first < 90/60/30 %; padded current is **zero** for these runs; RMSE from the restart point; replicated 3/2/1 before averaging | Same (`ISOC_CYCLES`, `build_input(isoc_idx)` zeroes the padded current, `isoc_weighted`) | Same |
| Test 11 | m1000 US06 −10 °C, HWFET 10 °C, LA92 40 °C with −0.3, −0.1, −0.05, +0.05, +0.1, +0.3 A; score uses only ±0.3 A (indices 1, 6, 7, 12, 13, 18) | Same (`OFFSETS`, `RELEVANT_OFFSET_IDX = [0,5,6,11,12,17]`) | Same |
| Weights | `{0 1/10 1/10 1/10 1/30 2/30 2/30 1/30 1/10 1/10 1/60×6 1/10 1/10}` | `WEIGHTS` identical; the site also stores them in the DB (`ScoringConfig`) so admins can change them **for the site's headline score** without touching the evaluator | Same defaults; **New** ability to re-weight |
| Validation run | m80 UDDS 10 °C, current +0.3 A, **60-sample** pad (Ahnaf version; the Server version used a 3600 pad and a 60 s `parfeval` timeout) | m80 UDDS 10 °C, +0.3 A, 60-sample pad | Same as Ahnaf; **Changed** vs Server (no 60 s limit — see timeouts) |
| Exploit flag | `mean(mean(RMSE)) > 25` | `suspicious = R.mean() > 25` | Same test, **Changed** consequence (§4) |

## 2. Complexity — Changed

| | Original tool | New evaluator |
| --- | --- | --- |
| Timing | `tic/toc` around the whole padded cycle, ÷ `length(X)` (pad included) | Same: seconds per padded sample, per cycle, averaged over all drive-cycle jobs |
| Normalisation | A live micro-benchmark (`FLOPS_MEM_counter(1,1)`: 1 s of FLOPs and 1 s of random memory loads) re-measured **every 10 cycles**, blended as `t_sample / (t_FLOP·β + t_MOP·α)` | A **fixed per-host, per-runtime constant** (`SOCBENCH_CAL_PYTHON`, `SOCBENCH_CAL_MATLAB`) measured once with the reference Coulomb counter |
| Binning | ⅓-decade bins, `cat` from 1 upward | Same bins, clamped to 1–10 |
| Reported | string `"cat-1,cat,cat+1"` | integer bin ± 1 (`complexityUncertainty = 1`); `complexityRaw` keeps the old triple in `results.json` |

Why: the micro-benchmark spent ~2 s of CPU every 10 cycles and, run inside a 2-vCPU sandbox, its FLOPs/MOPs figures are dominated by scheduler noise. Bins for the four example packages match on the same machine (CC 1/2, FNN 9, LSTM 8); loop-heavy code (EKF) bins higher on the VM than on a desktop because per-call overhead differs, not because of the formula. Complexity never enters the weighted error on either system. Deployment to a microcontroller (Atjen's work) is the only true complexity measure and is future work.

## 3. Execution — Changed (this is where the speed difference comes from)

| | Original tool | New evaluator |
| --- | --- | --- |
| MATLAB models | One MATLAB session (interactive tool), but **each cycle dispatched with `parfeval` to a parallel-pool worker**, serialising the whole cell table (32–40 MB `.mat`) per call; `parpool('local',2)` start-up first. (Server version: plain in-process calls, no watchdog.) | One `matlab -batch` session per evaluation; all 195 input matrices written to one `.mat`, `Run_Model.m` loops over them, results read back once |
| Python models | A **new Python process per cycle** (`system(python PythonModelRunner.py …)` with `.mat` in/out) — 195 interpreter start-ups + numpy imports | `Model.py` imported once, all cycles in-process |
| Where it runs | The submitter's model runs **on the lab PC's MATLAB path with full access** (files, network, the blinded `.mat` files sitting in the same folder) | Inside a Docker container: no network (Python) or licence-only egress (MATLAB), read-only root, dropped capabilities, CPU/memory/pid limits, only the package, an output dir and the blinded data (read-only) mounted; runs as an unprivileged uid |
| Concurrency | Sequential, one submission at a time (`while true` loop over the *Models* folder) | Two evaluations in parallel on the VM (configurable), several machines can share the queue |
| Timeouts | Ahnaf: 20 min per cycle via the `parfeval` watchdog; Server: 60 s on the validation run only | Whole-run limits: 10 min for a test run, 180 min for an evaluation (`PY_EVAL_TIMEOUT_MIN`); the container is killed on timeout or cancel |
| Figures | Rendered in MATLAB during the run (`Create_Figures.m`, ~10 LaTeX-titled figures, `savefig` + `.svg`) and zipped | No rendering in the evaluator; the site stores ~240-point traces and draws them in the browser / PDF |
| Progress | Console prints every 2 min | Sample-weighted `NN.N% | cycle` lines streamed to the job log; ETA on the site |

Net effect: identical model loop and scores, but no per-cycle data copying, no per-cycle process spawns, no figure rendering inside the timed run — a full MATLAB LSTM evaluation takes minutes on the VM.

## 4. Validation, failures and exploits — Changed

| | Original tool | New evaluator / site |
| --- | --- | --- |
| Package format | `.zip` with `Model.m/.p/.py` **and a 4-row `.xlsx`** (Author, Affiliation, Email, Model name) | `.zip` with `Model.m/.p/.py` at the top level; author metadata comes from the account and the form. No `.xlsx` (would be ignored) |
| Pre-checks | none beyond "does `Model.*` exist" | `package-check.ts`: no sub-folders, no path traversal/symlinks, ≤ 500 entries, ≤ 512 MB uncompressed, zip-bomb ratio, `Model.m` must declare `function [Y, z] = Model(X, z)`, `Model.py` must define `Model(`; warnings for `load()` and deep-learning imports |
| Pre-submission test | none (a broken model was discovered by the full run) | "Test your package": validation run + one **open** cycle, rate-limited, before anything is scored |
| Failed model | e-mail with the error text; entry saved as `Model__N.zip` | Job marked FAILED with the error and the log; up to 3 attempts for infrastructure errors; author e-mailed; admin can retry |
| `mean RMSE > 25` | Flagged `_EXPLOIT`; author gets rank only, **no data**; entry still on the leaderboard | Flagged in the log only; results are shown normally. **Dropped** behaviour — an admin-visible badge / withholding is an open item (README TODO) |
| Identical scores | Rejected as `_DUPLICATE` (compares 22 columns) and not added | **Dropped** — duplicates are allowed (an author may legitimately resubmit the same package as a new version); could be reinstated as a warning |
| Crash recovery | On restart, the interrupted submission is renamed `_CRASH` and the author e-mailed to resubmit | Jobs are re-queued automatically (lock heartbeat; a worker that dies loses its lock after 15 min) — nothing to resubmit |
| Runtime hardening | none | see §3 (sandbox) and `docs/security.md` |

## 5. Outputs and records — Changed / New

| | Original tool | New evaluator / site |
| --- | --- | --- |
| Leaderboard | `Leaderboard.csv`: time, author, affiliation, model, weighted error, 18 test scores, all-cycle average RMSE / **average MAE / average MAXE**, complexity string, id, position | Postgres: the same 18 test scores and weighted error; per-cycle rows (144: cell, cycle, temperature, RMSE, MAE, max error, duration); **`maxError` = the single worst |error| over all cycles** (the old tool's "Average_MAXE" was the mean of per-cycle maxima; both `meanMae` and `meanMaxe` are still computed in `results.json` but not stored) |
| Sent to the author | ZIP with `Error_Summary_Table.mat` (full-resolution `timeseries` of actual/estimated SOC for every drive cycle) + all `.fig`/`.svg`, plus the whole leaderboard CSV; split in two mails if > 25 MB | E-mail with a PDF report (summary, all test cases with weights and arithmetic, 8 drive-cycle traces, per-cycle table, score history) and a link to the results page; JSON download of results |
| Time-domain data | Every cycle at full resolution (1 Hz `single`) in the e-mailed ZIP | Charts use ~240 points per trace (peak-preserving min/max bucketing, so every spike survives). Since 2026-08-30 the full 1 Hz traces of **every run** (144 cycles + charge + 27 robustness runs, 0.01 % resolution, ~6 MB MATLAB v7 file) are stored per submission and downloadable from the results page — Same coverage, now on demand instead of e-mailed |
| Figures | Test 1–8 bar plot, test 9 bar plot, and the 13 time-domain panels + initial-SOC + offset panels, plus RMSE-vs-offset curves | Same content as interactive charts (Summary bars, temperature bars, Key cases tab with the same panels). **Dropped**: the RMSE-vs-offset curve (the 18 per-offset RMSEs are in `results.json → robustness` but not stored in the DB) |
| Submission record | `Models Saved/Model__N.zip` kept forever (the model source) | The package is deleted from storage after evaluation; only results are kept (privacy / IP) — **Changed** by design |
| Versioning | none | `evaluatorVersion = socbench-eval-<ver>/<runtime>` on every result; older results are marked legacy and unranked when the benchmark version changes; score history per submission |
| Re-scoring | not possible (would need a re-run) | Weighted error can be recomputed from stored test scores when weights change, with history and notification |

## 6. Operations — New

| | Original tool | New |
| --- | --- | --- |
| Intake | Authors e-mailed a `.zip`; someone dropped it into the *Models* folder on a lab PC; MATLAB polled the folder every few seconds | Web upload with account, e-mail verification, rate limits, collaborators, private submissions, contests |
| Host | One Windows PC running an interactive MATLAB session 24/7, sending a daily uptime e-mail to Dr. Kollmeyer; Gmail app password hard-coded in the script | Alliance Cloud VM, systemd service, auto-updating from git, admin page with live status/console/queue, e-mail via SMTP settings (secrets in a 600 file) |
| MATLAB licence | The PC's interactive licence | Campus-wide licence via MathWorks online licensing (24 h access tokens exchanged by the worker) |
| Runtime support | MATLAB (`Model.m/.p`); Python added by Ahnaf via `PythonModelRunner.py` (a fixed conda path) | MATLAB R2026a and Python 3.12 (numpy/scipy; PyTorch optional) in separate sandbox images; workers advertise what they can run |

## 7. Things that were checked to be numerically identical

Four reference packages (Coulomb counter, EKF, FNN, LSTM), both `.m` and `.py` variants, evaluated on the laptop (host MATLAB / host Python) and on the VM (both sandboxes): all 18 test scores, weighted error and max error agree to the third decimal (one EKF column differs by 0.001 — float summation order). The archived `Leaderboard.csv` values for the same packages were matched earlier (README TODO, 2026-08-25).

## 8. Open differences worth a decision

1. **Exploit handling** — old tool withheld results when mean RMSE > 25 %; we only log it. Decide: badge + withhold, or keep showing.
2. **Duplicate scores** — old tool refused identical entries; we allow them. A "same as #N" warning is cheap to add.
3. ~~Full-resolution traces~~ — done 2026-08-30 ("Traces (.mat)" download on every new result).
4. **RMSE-vs-offset curve** — store the 18 per-offset and 9 initial-SOC RMSEs (already computed) and plot them.
5. **`maxError` semantics** — worst single sample (ours) vs mean of per-cycle maxima (old leaderboard column). Both are available in `results.json`; pick which the leaderboard shows.
6. **Complexity** — fixed calibration vs live micro-benchmark; only informational, but if bins are compared with historical entries, expect ±1 bin for loop-heavy MATLAB code.
