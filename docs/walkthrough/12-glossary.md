<a id="part-12"></a>
## 12. Glossary

### Battery terms

| Term | Meaning |
|---|---|
| **SOC, state of charge** | The fraction of usable capacity remaining, 0–100 %. It cannot be measured directly and is estimated from current, voltage and temperature. |
| **BMS** | Battery management system: the vehicle electronics that execute the estimator, one sample at a time. |
| **Cell** | One physical battery. Four Tesla 2170 cells are used, named for the simulated vehicle payload with which they were cycled: `m80`, `m448`, `m448N`, `m1000`. `m448` is withheld in its entirety. |
| **Drive cycle** | A standard speed profile converted to the current a cell delivers. UDDS (urban), HWFET (highway), LA92 and US06 (aggressive), HWCUST and HWGRADE (laboratory-designed, unpublished). |
| **Open / withheld data** | Open data is published for model development; withheld (blinded) data is reserved for scoring. `blind_data.mat` is the reference. |
| **Coulomb counting** | Integration of current over time: the simplest estimator, and the reference for the complexity scale. |
| **EKF / UKF** | Extended and unscented Kalman filters: model-based estimators that fuse a cell model with measurements. |
| **FNN / LSTM / GRU / Transformer** | Neural-network estimator architectures. |
| **RMSE / MAE / maximum error** | Root-mean-square, mean-absolute and worst single-sample error, in percentage points of SOC. |
| **Test case** | One of the eighteen scoring categories, each with a published weight. |
| **Weighted error** | The leaderboard score: the sum over test cases of weight × RMSE. |
| **Robustness run** | A run with a deliberately incorrect initial SOC, or with a constant offset added to the current. |
| **Padding** | One hour of the first sample prepended to each cycle so that stateful models reach steady state. |
| **Complexity** | Execution time per sample relative to a Coulomb counter, binned 1–10. Informational only. |
| **Test run (dry run)** | An evaluation on open data from the submission page; not recorded on the leaderboard. |
| **Package** | The uploaded archive: `Model.py` or `Model.m`/`Model.p` together with parameter files. |

### Software terms

| Term | Meaning |
|---|---|
| **Repository / git / GitHub** | The source code with its full change history, hosted on GitHub. |
| **Serverless** | A hosting model in which a short-lived server instance handles each request and is suspended once it responds. |
| **Container / Docker / image** | An isolated execution environment; the runtime that creates it; the template from which it is created. |
| **Sandbox** | A container with the network disabled, a read-only filesystem and no privileges. |
| **Database / table / row** | PostgreSQL stores all persistent state as tables of rows. |
| **Prisma** | The typed database client; one schema file defines every table. |
| **Server Component / Server Action** | A page rendered on the server from the database; a form handler executed on the server. There is no separate API layer. |
| **Signed URL** | A pre-authorised, time-limited address that permits a browser to upload directly to object storage. |
| **Session token / JWT / cookie** | A signed token held by the browser after sign-in, proving identity on each request. |
| **bcrypt** | A deliberately slow one-way hash function for passwords. |
| **Rate limit** | A cap on the number of attempts within a time window. |
| **Queue / job / worker / heartbeat** | Pending work; one unit of it; the process that performs it; the process's periodic liveness record. |
| **Compare-and-swap** | An update applied only if the row is unchanged since it was read; the mechanism by which two workers never claim the same job. |
| **Environment variable / `.env`** | Configuration and secrets supplied to a program from outside its code. |
| **VM / Arbutus / systemd** | A cloud virtual machine; the Alliance's cloud at the University of Victoria; the Linux service manager. |
| **mode 600** | A file readable and writable only by its owner. |

### Key figures

144 test cycles (4 cells × 6 temperatures × 6 cycles) · 195 runs per evaluation · 18 test cases with weights summing to 1 · 3 submissions per day and 5 test runs per hour · 6-hour evaluation limit · worker polls every 2 s, heartbeat every 15 s · a lock expires after 30 min, 2 attempts per job · 50 MB upload limit.

