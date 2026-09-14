<a id="part-11"></a>
## 11. Glossary

### Battery terms

| Term | Meaning |
|---|---|
| **SOC — state of charge** | How full a battery is, 0–100 %. It cannot be measured, only estimated from current, voltage and temperature. |
| **BMS** | The battery management system: the electronics in a vehicle that run the estimator, one measurement at a time. |
| **Cell** | One physical battery. Four Tesla 2170 cells here, named after the vehicle mass they were driven with: `m80`, `m448`, `m448N`, `m1000`. `m448` is fully hidden. |
| **Drive cycle** | A standard speed profile converted to the current a cell sees. UDDS (urban), HWFET (highway), LA92 and US06 (aggressive), HWCUST and HWGRADE (custom, never published). |
| **Open / blinded data** | Open is published for building models; blinded is secret and used only to score. `blind_data.mat` is the answer key. |
| **Coulomb counting** | Integrating current over time: the simplest estimator, and the reference for the complexity scale. |
| **EKF / UKF** | Kalman filters: classical estimators that fuse a physics model with measurements. |
| **FNN / LSTM / GRU / Transformer** | Neural-network estimators. |
| **RMSE / MAE / max error** | Root-mean-square, mean-absolute and worst single-sample error, in % SOC. |
| **Test case** | One of the 18 scoring categories; each has a weight. |
| **Weighted error** | The leaderboard score: the sum of weight × test-case RMSE. |
| **Robustness sweep** | Starting the model at the wrong SOC, or feeding it current with a constant offset. |
| **Padding** | An hour of the first sample repeated before each cycle so models with memory settle. |
| **Complexity** | A 1–10 bin of compute per sample relative to a Coulomb counter. Informational only. |
| **Dry run** | A free test on open data; no leaderboard entry. |
| **Package** | The uploaded zip: `Model.py` or `Model.m`/`Model.p` plus parameter files. |

### Software terms

| Term | Meaning |
|---|---|
| **Repository / git / GitHub** | The source code, every change recorded, hosted on GitHub. |
| **Serverless** | The host starts a tiny server per request and freezes it the instant it answers. Cheap; quirky. |
| **Container / Docker / image** | An isolated box a program runs in; Docker runs them; an image is the template. |
| **Sandbox** | A container locked down as far as possible: no network, read-only files, no privileges. |
| **Database / table / row** | PostgreSQL stores everything as tables of rows. |
| **Prisma** | Lets TypeScript talk to the database with typed calls; one schema file describes every table. |
| **Server Component / Server Action** | A page that reads the database on the server; a form handler that runs on the server. No API layer. |
| **Signed URL** | A temporary pre-authorised link that lets a browser upload straight to file storage. |
| **Session / JWT / cookie** | After login the browser holds a signed token proving who you are. |
| **bcrypt** | A deliberately slow one-way scramble for passwords. |
| **Rate limit** | At most N attempts per time window. |
| **Queue / job / worker / heartbeat** | Work waiting to be done; one item of it; the program that does it; its periodic "I'm alive". |
| **Compare-and-swap** | "Update this row only if it is still the way I last saw it" — how two workers never take the same job. |
| **Environment variable / `.env`** | Configuration and secrets handed to a program from outside its code. |
| **VM / Arbutus / systemd** | A rented cloud computer; the Alliance's cloud at UVic; Linux's way of running a program as a service. |
| **mode 600** | A file only its owner can read. |

### Numbers worth remembering

144 test cycles (4 cells × 6 temperatures × 6 cycles) · 18 test cases, weights sum to 1 · 3 submissions per day, 5 dry runs per hour · 6-hour evaluation limit · worker polls every 2 s, heartbeat every 15 s · a lock goes stale after 30 min, 2 attempts per job · 50 MB upload cap.

