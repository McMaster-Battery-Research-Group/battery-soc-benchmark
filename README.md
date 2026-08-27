# Battery SOC Benchmark

The web platform behind the McMaster Automotive Resource Centre's **Blind Modeling Tool**: researchers anywhere upload a battery **state-of-charge (SOC) estimation algorithm**, we run it against a **hidden ("blinded") dataset** measured on Tesla Model 3 2170 cells, and the result goes on a public **leaderboard** — with model comparison, PDF reports, co-authors, and time-boxed prize **contests**.

Live site: https://battery-soc-benchmark.vercel.app · Code: https://github.com/AhmadAli137/battery-soc-benchmark

This README is written for someone joining the project with modest programming experience. It explains **what** the system does, **how** each part works, **why** it is built that way, and **how to run and operate it**. Skim the table of contents, read Part 1 fully, and come back to the rest as you need it.

---

## Contents

**Part 1 — Understanding the project**
1. [What the benchmark does, in plain words](#1-what-the-benchmark-does-in-plain-words)
2. [Glossary](#2-glossary)
3. [The big picture (architecture)](#3-the-big-picture-architecture)
4. [Life of a submission, step by step](#4-life-of-a-submission-step-by-step)
5. [The evaluator — the actual science](#5-the-evaluator--the-actual-science)
6. [How scores are computed](#6-how-scores-are-computed)

**Part 2 — Working on the code**
7. [Set up your computer](#7-set-up-your-computer)
8. [Where things live (repository map)](#8-where-things-live-repository-map)
9. [Key mechanisms explained](#9-key-mechanisms-explained)
10. [Day-to-day development workflow](#10-day-to-day-development-workflow)

**Part 3 — Security**
11. [Threat model and defences](#11-threat-model-and-defences)

**Part 4 — Running it for real**
12. [Production layout and deployment](#12-production-layout-and-deployment)
13. [Operating the evaluation worker](#13-operating-the-evaluation-worker)
14. [Configuration reference (environment variables)](#14-configuration-reference-environment-variables)
15. [Troubleshooting](#15-troubleshooting)

**Part 5 — Reference**
16. [Branding and institutional logos](#16-branding-and-institutional-logos)
17. [Other documents](#17-other-documents)
18. [TODO](#18-todo)

---

# Part 1 — Understanding the project

## 1. What the benchmark does, in plain words

A battery management system needs to know how full a battery is — its **state of charge (SOC)**, 0–100 %. It cannot measure this directly; it must *estimate* it from things it can measure: current, voltage and temperature. Many algorithms exist (Coulomb counting, Kalman filters, neural networks…) and every paper claims its own is best, usually on its own data. That makes results hard to compare.

This benchmark fixes that by being a neutral referee:

1. The lab published an **open dataset** (Tesla 2170 cells driven through standard drive cycles at six temperatures) that anyone can use to build and train a model.
2. The lab kept a second, **blinded** part of the data secret. Nobody outside the lab has seen it.
3. A researcher packages their algorithm as a single function — `Model(X, z)` in MATLAB or Python — that takes one measurement at a time and returns an SOC estimate.
4. They upload it here. Our **worker** runs their model over every blinded drive cycle (144 of them, plus charging cycles and robustness tests) and computes the error against the true SOC.
5. The results are scored with published weights, published on the leaderboard, and e-mailed to the author as a PDF report. The uploaded model is deleted right after.

Because everyone is scored on the *same hidden data* with the *same code*, the numbers are directly comparable. That is the whole point.

### Who uses it

- **Researchers / students** (anywhere): register, test their package, submit, read results, add co-authors, enter contests.
- **The lab (administrators)**: run the evaluation machine(s), watch the queue, manage contests and users, answer feedback.
- **You**: keep the software working and improve it.

## 2. Glossary

| Term | Meaning here |
| --- | --- |
| **SOC** | State of charge, the battery's "fuel gauge", as a percentage. The quantity every submitted model must estimate. |
| **Cell** | One physical battery. The dataset has four: `m80`, `m448`, `m448N`, `m1000` (named after the vehicle-mass profiles they were driven with). `m448` is the fully blinded cell — no data about it is public at all. |
| **Drive cycle** | A standard speed-vs-time profile (UDDS, HWFET, LA92, US06, plus custom HWCUST/HWGRADE) converted into a current profile the cell was subjected to. |
| **Open data / blinded data** | Open = published on Borealis, use it to build your model. Blinded = kept secret on the evaluation machine only; used to score. **The blinded file must never leave the worker machine or enter this repository.** |
| **Submission / package** | A `.zip` containing `Model.m`, `Model.p` (MATLAB) or `Model.py` (Python) at the top level, plus any parameter files it loads. |
| **Dry run** | A quick test of a package on *one open* drive cycle (2 h of the public m80 data). Catches format and runtime errors before a real submission. Never touches blinded data, does not create a leaderboard entry. |
| **Evaluation / job** | A full run of a submitted package over all blinded data. Takes 10 s (simple Coulomb counter, Python) to ~45 min (heavy neural network in MATLAB). |
| **Worker** | The background program (`npm run worker`) on a machine that has the blinded data and MATLAB. It watches the database for queued jobs and runs them. |
| **Sandbox** | The Docker container each evaluation runs in, isolated from the machine (no network, read-only, no secrets). See Part 3. |
| **Test case** | One of the 11 published scoring categories (all cells, blinded cell, charging, each temperature, sensor-offset robustness…). |
| **Weighted error** | The single headline score: the per-test-case RMSE values combined with the official weights. Lower is better. |
| **RMSE / MAE / max error** | Root-mean-square error, mean absolute error, and worst instantaneous error between estimated and true SOC, in % SOC. |
| **Complexity** | A 1–10 bin describing how much compute the model needs per sample, relative to a plain Coulomb counter, so cheap and expensive models are visibly different. |
| **Contest** | A time-boxed event with its own frozen leaderboard and prize; contest entries must stay public. |
| **Collaborator / co-author** | Another registered user listed on a submission. They must accept an invitation before appearing publicly. |
| **Web tier / worker tier** | The website (runs on Vercel, in the cloud) versus the evaluation worker (runs on a lab machine). Two separate programs sharing one database. |

## 3. The big picture (architecture)

```
   Researcher's browser                     Cloud (free tiers)                         Lab machine(s)
 ┌──────────────────────┐        ┌────────────────────────────────────┐        ┌──────────────────────────────┐
 │ Next.js pages (React)│ HTTPS  │  Vercel — the web tier             │        │  Worker  (npm run worker)     │
 │ leaderboard, submit, │◀──────▶│  • server-rendered pages           │        │  • polls the DB every 2 s     │
 │ profile, admin …     │        │  • server actions (form handlers)  │        │  • claims a queued job         │
 └──────────┬───────────┘        │  • API routes (status, PDF, upload)│        │  • runs the evaluator in a     │
            │ direct upload      └───────┬───────────────────┬────────┘        │    Docker sandbox              │
            │ (signed URL)               │ Prisma            │ SMTP            │  • writes results + e-mails    │
            ▼                            ▼                   ▼                 │  • heartbeat every 15 s        │
 ┌──────────────────────┐        ┌────────────────┐   ┌─────────────┐          └──────┬────────────┬───────────┘
 │ Supabase Storage     │        │ Supabase       │   │ Mail relay  │                 │ Prisma     │ download
 │ private bucket       │◀───────│ PostgreSQL     │◀──┤ (Gmail now, │                 ▼            ▼ package
 │ "packages" (zips)    │ delete │ users, subs,   │   │ Resend soon)│        (same PostgreSQL)  (same bucket)
 └──────────────────────┘ after  │ results, jobs, │   └─────────────┘
                          eval   │ heartbeats …   │
                                 └────────────────┘
                                                                              blind_data.mat lives ONLY here ──▶ 🔒
```

The design rule that explains almost everything: **the website never runs anyone's code and never sees the blinded data.** The website only reads and writes rows in the database. The worker — a normal Node.js process on a machine the lab controls — does all the dangerous work, and even it hands the actual model execution to a throw-away Docker container.

**Why these pieces**

| Piece | Technology | Why |
| --- | --- | --- |
| Website | Next.js 15 (React 19, TypeScript, Tailwind CSS 4) | One framework for pages, forms and small APIs; free hosting on Vercel; server-side rendering keeps data access on the server. |
| Database | PostgreSQL on Supabase, accessed through Prisma | Free, managed, backed up manually; Prisma gives us typed queries and one schema file (`prisma/schema.prisma`) that is the single source of truth for every table. |
| File storage | Supabase Storage (private bucket) | Vercel functions cannot accept 50 MB uploads, so the browser uploads straight to the bucket through a short-lived signed URL; the worker downloads with a secret key. Same account as the database — one dashboard. |
| Authentication | Auth.js v5, e-mail + password, e-mail verification, JWT cookies | Simple, no third-party identity provider needed for an academic audience. |
| Worker | Node.js + Python (`socbench_eval`) + MATLAB, Docker for isolation | The benchmark maths is numpy; MATLAB only executes `.m/.p` models; Docker contains untrusted code. |
| E-mail | SMTP via nodemailer | Provider-agnostic: Gmail today, Resend once the domain exists — config only. |
| PDF report | pdfkit (server-side, vector charts) | Attached to results e-mails and downloadable; no browser needed. |

## 4. Life of a submission, step by step

This is the one flow to understand end to end. File names are given so you can follow along in the code.

1. **Register & verify.** `src/app/(auth)/register` → `registerAction` creates a `User` (password hashed with bcrypt) and e-mails a verification link. Opening the link shows a *Confirm my email* button; pressing it (a POST) marks the account verified. (Two steps, because corporate mail scanners "click" links automatically — see §9.)
2. **Test the package (optional but recommended).** On `/submit`, *Test your package first* uploads the zip, creates a `DryRun` row, and the worker runs it on 2 h of open data. The page polls `/api/dry-runs/[id]` every 2 s and shows the live console, then RMSE/complexity and a chart.
3. **Submit.** The browser asks `/api/upload` for a signed URL, PUTs the zip into the private bucket, then posts the form to `createSubmissionAction` (`src/app/(app)/submit/actions.ts`). The server re-downloads the file, checks the zip (structure, size, zip-bomb, traversal), checks daily limits and contest rules, and creates a `Submission` row with status `QUEUED` plus an `EvaluationJob` row. Chosen collaborators are stored as *pending*.
4. **Queue.** The submission page shows position, estimated wait and whether the evaluator machine is online — all derived from the `WorkerHeartbeat` and job tables (`src/lib/worker-status.ts`).
5. **Claim.** The worker (`src/evaluator/worker.ts`) calls `claimNext()` (`run-job.ts`), which atomically locks the oldest unclaimed job so two machines never take the same one. Dry runs jump the queue because they are short.
6. **Evaluate.** `runJob()` downloads the package (`storage.materialize`), then `PythonEvaluator.spawn()` (`python-evaluator.ts`) starts a Docker container running `python -m socbench_eval package.zip out --data blind_data.mat`. Every progress line the evaluator prints is streamed into the job log in the database, which is what the web page shows as the console, percentage and ETA. Each log write also refreshes the job lock (a heartbeat) so a long run is not mistaken for a dead one.
7. **Score & store.** The evaluator writes `results.json`; the worker parses it (`results.ts`), stores an `EvaluationResult` (scores, per-cycle table, time-series traces), flips the submission to `COMPLETED`, and **deletes the package** from the bucket.
8. **Notify.** The worker builds the PDF (`src/lib/report.ts`) and e-mails it to the owner and every *accepted* collaborator. The submission page reloads itself to show charts, tables and the download button. The leaderboard (`src/lib/queries.ts`) recomputes ranks from the stored scores.
9. **Afterwards.** The owner can make it private/public, add collaborators (pending → invited → accepted), cancel a queued/running one, or delete it. Admins can hide it, retry it, or release a stuck lock.

If anything fails, the job is retried once (`MAX_ATTEMPTS = 2`) unless the failure was the submitter's fault (bad package, model error), in which case the user gets the exact error and a failure e-mail.

## 5. The evaluator — the actual science

`evaluator/python/socbench_eval/` **is** the benchmark: ~450 lines of numpy that reproduce the lab's original *Standardized Evaluation Tool* exactly. This was verified on the real blinded data — the CC, EKF, FNN and LSTM example packages reproduce every column of the lab's historical `Leaderboard.csv` to 0.000, and Python and MATLAB runtimes agree to three decimals.

What it does for one package:

1. **Validation run** — m80 UDDS at 10 °C with +0.3 A added to the current. If the model crashes or produces nonsense here, the whole evaluation stops with a user-facing error (saves 45 minutes).
2. **Padding** — every cycle is preceded by one hour of constant rest so models with internal state (filters, RNNs) settle; the padded part is excluded from the metrics.
3. **144 blinded cycles** (4 cells × 6 temperatures × 6 cycles) plus charging cycles — the model is called once per sample, carrying its state `z` forward exactly as a real BMS would.
4. **Robustness sweeps** — the same model started at wrong initial SOC (90/60/30 % instead of 100 %) and with constant current-sensor offsets (±0.05 / 0.1 / 0.3 A).
5. **Metrics** — RMSE, MAE and max error per cycle; positional means per test case; the weighted headline score; and a complexity bin from time-per-sample relative to a calibrated Coulomb counter (`SOCBENCH_CAL_PYTHON` / `SOCBENCH_CAL_MATLAB`, seconds per sample on that host — recalibrate when the evaluation machine changes).

The only runtime-specific part is *executing the model*:

| Package contains | Executed by | Needs |
| --- | --- | --- |
| `Model.py` | Python, in-process (`runner.py → PythonBackend`) | numpy/scipy (PyTorch optional in the sandbox image) |
| `Model.m` / `Model.p` | one MATLAB session via `matlab/Run_Model.m` (~40 lines; `MatlabBackend`) | MATLAB + whatever toolboxes the model calls |

Layout:

```
evaluator/python/socbench_eval/   the benchmark — data.py (load .mat), runner.py (execute models, stream progress),
                                  pipeline.py (metrics, weights, complexity), __main__.py (CLI, safe zip extraction)
evaluator/python/dryrun_data.mat  2 h of OPEN data for dry runs (ships with the repo)
evaluator/examples/*.zip          runnable reference packages (CC, EKF, FNN, LSTM × MATLAB/Python)
evaluator/Dockerfile              sandbox image for Python packages      evaluator/Dockerfile.matlab  for MATLAB (Linux)
matlab/Run_Model.m                executes a MATLAB model on a batch of inputs — nothing else
matlab/Export_Blind_Data.m        one-time export of the lab's Data_m*.mat tables → blind_data.mat
blind-data/                       blind_data.mat (git-ignored; evaluation host ONLY)
```

Run it by hand (useful when debugging a package): `cd evaluator/python && python -m socbench_eval package.zip outDir --data ../../blind-data/blind_data.mat [--runtime python|matlab]`, or add `--dry-run` for the open-data check. Progress lines look like `12.5% | cycle:m80:3` — the percentage is weighted by samples, and the website's progress bar and ETA are computed from these.

**Example packages** — the Examples page shows each reference model in MATLAB and Python with a toggle, offers the zips for download (`/examples/download/<file>`), and can queue a dry run of any of them with one click. All eight give identical open-cycle RMSE across runtimes (0.172 / 0.076 / 1.463 / 2.009 %).

## 6. How scores are computed

Everything on the leaderboard derives from the 18 numbers the evaluator produces per submission (`src/lib/test-cases.ts` lists them with descriptions, weights and display labels):

- **Tests 1–8** — mean RMSE over groups of cycles: all cells (weight 0 — headline only), the blinded cell, non-blinded cells, charging, each payload/HVAC condition, standard cycles, non-standard cycles.
- **Test 9** — six temperature entries (−20 … 40 °C) for the m80 cell, weight 1/60 each.
- **Tests 10–11** — initial-SOC error (weighted 3/2/1 for the 90/60/30 % starts) and current-sensor offset.

**Weighted error** = Σ weightᵢ × RMSEᵢ with the published V2 weights (1/10, 1/30, 2/30, 1/60 — they sum to exactly 1). The evaluator computes it; the website re-derives it from the stored values as a cross-check and logs a warning if they ever disagree. Lower is better; ties are ranked by submission time.

The leaderboard shows only **public, completed, non-hidden** submissions. A signed-in user may tick *show where my private models would rank*, which adds their private ones with a dashed "~16" ghost badge without changing anyone else's rank.

### What happens if we change the grading?

Every stored result carries the evaluator stamp that produced it (`EvaluationResult.evaluatorVersion`, e.g. `socbench-eval-0.1.0/python`). `src/lib/benchmark-version.ts` names the **current** benchmark version; anything older is shown with a *legacy scoring* badge on the leaderboard, the admin table and the submission page, with a note to re-submit. The rules:

- **Only the weights change** (a policy decision): edit `src/lib/test-cases.ts` and `pipeline.py` together, then run `npx tsx scripts/rescore.ts --apply --notify --note "<what changed and why>"` — it recomputes every weighted error from the 18 stored per-test values (no re-evaluation), appends a **score revision** to each affected submission, and e-mails the owner and accepted collaborators the old → new score, your note and a fresh PDF. Run it without `--apply` first to preview.
- **Score history**: every evaluation attempt, failure, re-run and re-score is an immutable `ScoreRevision` row (`src/lib/history.ts`). The submission page (*Details → Score history*) and the PDF's *Score history* table show them; `EvaluationResult` always holds the current numbers.
- **Metrics, data, padding, sweeps or complexity bins change**: bump `__version__` in `socbench_eval/__init__.py` and `BENCHMARK_VERSION` in `benchmark-version.ts`. Old results cannot be recomputed — the uploaded packages are deleted after evaluation on purpose (third-party IP) — so they stay as historical entries marked legacy, and authors are invited to re-submit. Announce the change on the Methodology page and, for a contest, freeze its leaderboard before the switch.
- Keeping packages to allow automatic re-evaluation would require explicit consent from submitters; if the lab wants that, add an opt-in checkbox at submission time and a retention policy before enabling it.

---

# Part 2 — Working on the code

## 7. Set up your computer

You need: **Node.js 20+**, **Docker Desktop** (for the local database, and for the sandbox if you run a worker), **Git**, and optionally **Python 3.11+ with numpy/scipy** and **MATLAB** if you want to run evaluations locally. Windows, macOS and Linux all work; the commands below are for PowerShell/Git Bash.

```bash
git clone https://github.com/AhmadAli137/battery-soc-benchmark.git
cd battery-soc-benchmark
cp .env.example .env            # defaults work for local dev
npm install
npm run setup                   # Postgres in Docker (port 5433) + schema + seed data
npm run dev                     # website at http://localhost:3000
npm run worker                  # in a second terminal: processes evaluation jobs (mock evaluator by default)
```

(`npm run setup` = `db:up` + `prisma db push` + `seed`. In Windows PowerShell 5.1 run commands on separate lines — it does not support `&&`; npm scripts do.)

Seeded accounts (local only):

| Role  | Email                                  | Password    |
| ----- | -------------------------------------- | ----------- |
| Admin | `admin@batterysocbenchmark.ca`         | `Admin123!` |
| User  | `a.rahman@example.edu` (and others)    | `Password1` |

Without `SMTP_HOST` set, e-mails go to an auto-created **Ethereal** test inbox and the preview URL is printed in the terminal — open it to see the verification/results mails.

The local `.env` uses `EVALUATOR=mock`, which produces plausible fake scores in a few seconds so you can work on the site without the blinded data. To run **real** evaluations locally you need the blinded `.mat` (from the lab — never commit it), `EVALUATOR=real`, `SOCBENCH_BLIND_DATA=<path>`, Python with numpy/scipy, and `docker build -t socbench-eval evaluator` for the sandbox.

## 8. Where things live (repository map)

```
src/app/                     Next.js App Router — one folder per URL
  page.tsx                   landing page
  (marketing)/               dataset, docs (methodology), getting-started, examples, glossary, help, about, contact, contest/[slug], [legal]
  (auth)/                    register, login, verify, forgot/reset password  + actions.ts (the form handlers)
  (app)/                     leaderboard, compare, submit (+ dry-run panel), submissions, submissions/[id], profile, users/[id], collab/[token]
  (admin)/admin/             overview, submissions, contests, users, messages, workers (evaluation machines)
  api/                       small JSON/binary endpoints: submissions/[id]/status, …/report.pdf, dry-runs/[id], upload, users/[id]/avatar, jobs/run
  actions/                   server actions shared across pages (user search, dry-run quota)
src/components/              React components: ui/ (buttons, inputs, dialogs…), charts/ (Recharts, MATLAB-style zoom), leaderboard/, layout/, avatar, user-picker, log-view …
src/lib/                     plain TypeScript used by pages and the worker
  auth.ts, auth.config.ts    Auth.js setup, requireUser/requireAdmin, admin allow-list
  queries.ts                 leaderboard rows, submission detail, visibility rules (canViewSubmission)
  scoring.ts, test-cases.ts  weights and metric definitions          progress.ts   progress %/ETA parsing (shared client+server)
  storage.ts                 local-disk or Supabase Storage           rate-limit.ts  DB-backed sliding-window limiter
  mail.ts                    every e-mail template                    report.ts      the PDF
  package-check.ts           zip validation                           worker-status.ts  heartbeats, queue position, wait estimate
  validation.ts              zod schemas for every form               log.ts         structured event logging
src/evaluator/               the worker tier
  worker.ts                  the resident process: polling loop, heartbeat, diagnostics, graceful shutdown
  run-job.ts                 claim/run one job or dry run; logging, cancellation, e-mails, retries
  python-evaluator.ts        starts socbench_eval (in Docker or on the host); kill/timeout/abort handling
  mock-evaluator.ts          fake results for development
  results.ts, types.ts       parsing results.json; the Evaluator interface
evaluator/                   the benchmark itself (Python), Dockerfiles, example packages   (see §5)
matlab/                      the two MATLAB scripts
prisma/schema.prisma         every database table (read this to understand the data model); prisma/seed.ts
scripts/                     setup-storage.ts (create the bucket), install-worker-task.ps1 (Windows service-style worker)
docs/                        security.md, compliance.md, drac-migration.md
public/logos/                McMaster + NSERC marks (placeholders until official files arrive)
```

**The data model in one breath** (`prisma/schema.prisma`): `User` ⟶ has many `Submission` ⟶ each has one `EvaluationJob` (queue state + log) and, when done, one `EvaluationResult` (scores + per-cycle + traces); `SubmissionCollaborator` links extra users to a submission with pending/invited/accepted state; `DryRun` is the lightweight test record; `Contest`/`ContestEntry` for events; `WorkerHeartbeat` one row per running worker; `RateLimitHit` for abuse limits; `UserToken` for verification/reset links; `ContactMessage` for the feedback form.

## 9. Key mechanisms explained

These are the parts that are not obvious from reading a single file.

**Server actions vs API routes.** Forms call *server actions* — plain async functions marked `"use server"` that Next.js runs on the server when a form is submitted (`registerAction`, `createSubmissionAction`, …). They return `{ errors, values }` so the form can show messages without losing what was typed. *API routes* (`src/app/api/**/route.ts`) exist only for things that are not form posts: polling status as JSON, streaming a PDF, issuing signed upload URLs, the cron endpoint.

**Authorization.** Every server action and API route decides for itself who may do what: `requireUser()`, `requireAdmin()`, `ownedSubmission()`, and `canViewSubmission()` (owner, admin or accepted/invited collaborator may see a private one). The middleware only redirects unauthenticated visitors away from `/submit`, `/profile`, `/admin`.

**Admin accounts.** Anyone whose e-mail is in `ADMIN_EMAILS` is an administrator the moment they sign in (checked in the session callback, so no re-login needed) and is exempt from the dry-run limit; the *Admin → Users* page can also grant/revoke the role.

**The job queue is the database.** There is no separate queue service. `claimJob()` does an atomic `updateMany` on the oldest unclaimed `EvaluationJob` with a fresh `lockedAt`; if two workers race, only one update succeeds. A lock older than 30 minutes with no heartbeat is considered abandoned and can be re-claimed. Every progress line refreshes the lock, so healthy long runs are never stolen.

**Heartbeat and "evaluator online".** Each worker upserts a `WorkerHeartbeat` row every 15 s with liveness, machine diagnostics (CPU, RAM, disk, Python, MATLAB + toolboxes, blinded data present, code version), current jobs and its last 200 console lines. The Submit page turns this into *Evaluator online / paused*; the admin *Evaluation workers* page shows everything and can send pause/resume/stop commands back through the same row.

**Progress and ETA.** The evaluator prints `NN.N% | stage` after each input matrix (weighted by samples). `src/lib/progress.ts` parses the job log for the percentage and extrapolates the remaining time; for queued jobs `worker-status.ts` adds the live remaining time of running jobs plus typical durations of the jobs ahead (from past runs of the same model type).

**Cancellation and shutdown.** Cancel sets `cancelRequestedAt`; the worker notices within seconds, kills the evaluator process tree (including MATLAB and the container) and deletes the submission. Ctrl+C on the worker aborts in-flight runs the same way but hands the jobs back to the queue without using an attempt.

**Collaborators.** Added people are *pending* (no e-mail, not public) until the owner presses *Send invitations* (confirmation dialog, owner CC'd). The invitee must accept — from the e-mail landing page while signed in as themselves, or from the submission page — before appearing on the leaderboard, researcher pages and the PDF. Accepted collaborators receive results e-mails; the owner is told when someone accepts or declines.

**E-mail verification in two steps.** Mail security products (Microsoft Safe Links etc.) fetch every link in an e-mail before the person sees it. A verify-on-click link would be "clicked" by the scanner. So opening the link only shows a *Confirm my email* button; the POST behind it does the verification, and the token is kept until expiry so a second visit says "already verified" rather than "invalid".

**Uploads.** Vercel limits request bodies to ~4.5 MB, far below a 50 MB package. `/api/upload` returns a signed URL for the private bucket; the browser PUTs the file there directly (with progress); the server action then receives only the object key, re-validates the zip, and the worker downloads it with the service key. The object is deleted after evaluation.

**Dates.** Every timestamp is formatted in the benchmark's home timezone (`America/Toronto`, with the zone label) regardless of where the code runs — Vercel's servers are in UTC.

**Logging.** The worker prints a startup banner (environment, host, Python/MATLAB, blinded data, sandbox state) and one line per event (claimed, progress, e-mail sent/failed, sandbox held/resumed, idle). The web tier writes one structured line per event via `logEvent()` (`event=submission.created seq=64 …`) — visible in Vercel → Logs or the `next dev` terminal.

## 10. Day-to-day development workflow

1. **Branch or commit on `main`** — the project currently commits straight to `main`; every push triggers a Vercel build and, if it passes, a production deploy. Keep commits small and described.
2. **Before every commit** run `npx tsc --noEmit` (types) and `npx eslint src` (lint); both must be clean. `npm run build` occasionally, especially after touching `next.config.ts` or adding server dependencies.
3. **Database changes**: edit `prisma/schema.prisma`, run `npx prisma db push` (development) — then **stop the dev server and any worker before `npx prisma generate`** on Windows, or the engine file stays locked and the generated client silently lags behind the schema (symptom: `Unknown argument <newField>` at runtime). Production schema is pushed with the production `DATABASE_URL`/`DIRECT_URL` in the environment.
4. **Evaluator changes** (Python): `python -m py_compile …`, then run a dry run of an example package by hand (§5). The worker spawns Python fresh for each job, so no restart is needed; the sandbox image must be rebuilt (`docker build -t socbench-eval evaluator`) when Python dependencies change.
5. **Worker changes** (TypeScript under `src/evaluator/`): the running worker must be restarted (Ctrl+C is graceful) to pick them up.
6. **Commit identity**: commits are authored by the maintainer's GitHub account; do not add AI co-author trailers.
7. **Never commit** `.env*` (except `.env.example`), `blind-data/`, `uploads/`, `worker.log` — they are git-ignored, keep it that way.

Useful scripts: `dev` · `build` · `start` · `lint` · `typecheck` · `db:up` · `db:push` · `db:migrate` · `db:studio` (browse the database) · `seed` · `worker` (local `.env`) · `worker:prod` (`.env.production`).

---

# Part 3 — Security

## 11. Threat model and defences

Read this before touching the worker or deployment. The full status list with open items is in `docs/security.md`; the McMaster policy mapping is in `docs/compliance.md`.

**The core problem:** the benchmark *must* execute code written by strangers. A malicious "model" could try to (1) read or memorise the blinded data — the answer key, (2) read the worker's secrets (database, storage, e-mail), (3) send data out or plant something on the evaluation machine, (4) flood the queue. The website faces ordinary risks: password guessing, spam, injection.

Defences, in layers (each assumes the previous one failed):

1. **Container sandbox** (`EVAL_SANDBOX=docker`, the default). Every evaluation runs in a throw-away Docker container: no network, read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, CPU/memory/process limits, unprivileged user, and only three mounts — the package (read-only), the blinded data (read-only, real runs only) and an output folder. The container never receives the worker's environment, so no secrets exist inside it. If Docker is not running, the worker starts Docker Desktop itself; if that fails it **holds the queue** rather than running unsandboxed. MATLAB packages are the exception on Windows (MATLAB cannot run in the container there) — they use layer 2 until the MATLAB image (`evaluator/Dockerfile.matlab`) is built on a Linux host.
2. **Allow-listed environment for anything running on the host.** Only `SOCBENCH_*`, `MATLAB_*`, PATH/temp/home variables reach a model process — never `DATABASE_URL`, `SUPABASE_SERVICE_KEY`, `SMTP_PASS`, `AUTH_SECRET`. Run the worker as a dedicated low-privilege account (`scripts\install-worker-task.ps1 -RunAsUser socbench`) and keep the repo, `.env.production` and `blind-data/` outside OneDrive or any synced folder.
3. **Package hygiene.** Zip entries are validated on upload *and* again before extraction: no `..` or absolute paths, no symlinks, ≤ 500 entries, ≤ 512 MB uncompressed, compression ratio ≤ 200 (zip bombs), top-level files only.
4. **Process control.** Hard timeouts (180 min real, 10 min dry run), cancel and shutdown all kill the *whole* process tree — Python, MATLAB and the container.
5. **Abuse limits.** Database-backed sliding windows (they work across Vercel's stateless functions): login 10/15 min per account + 40 per IP, registration 5/h per IP, reset & verification e-mails 3/h per address, contact form 5/h per IP, upload URLs 30/h per user, dry runs 5/h per user, and `SUBMISSIONS_PER_DAY` full evaluations per user (default 3; admins exempt).
6. **Web hardening.** CSP, HSTS, `nosniff`, `frame-ancestors 'none'`, referrer and permissions policies; bcrypt password hashes; e-mail verification required; per-object authorization on every action; the cron endpoint takes its secret in the `Authorization` header only (constant-time compare); signed short-lived upload URLs into a private bucket; packages deleted after evaluation; no user-supplied HTML in e-mails.
7. **Cheating detection** is statistical, not technical: a model that has memorised the blinded data cannot be stopped by sandboxing. Watch for implausibly low error on the blinded cell relative to open cells and for duplicate score vectors (admin badges on the TODO list). Contest prizes should involve a manual review.

If a secret is ever exposed, rotate it at the source (Supabase → Settings → Database / API) and update **both** Vercel and the worker's `.env.production`.

---

# Part 4 — Running it for real

## 12. Production layout and deployment

Everything runs on free tiers except the electricity for the evaluation machine.

| Piece | Where | Cost |
| --- | --- | --- |
| Website | **Vercel** (Hobby), auto-deploys from `main` | free |
| PostgreSQL | **Supabase** (free project, 500 MB) | free |
| Submission packages | **Supabase Storage**, private bucket `packages` | free |
| Evaluation | `npm run worker:prod` on a lab machine with the blinded data (+ MATLAB), or a free cron hitting `/api/jobs/run` for the mock evaluator only | free |

**First-time setup (already done for the live site; kept for rebuilding from scratch)**

1. **Supabase** — New project → *Connect → ORMs → Prisma* gives two URLs: `DATABASE_URL` = transaction pooler (port 6543) + `?pgbouncer=true`; `DIRECT_URL` = session pooler (port 5432). Push the schema from your machine:
   ```powershell
   $env:DATABASE_URL="<pooler url>?pgbouncer=true"; $env:DIRECT_URL="<session url>"
   npx prisma db push
   ```
   Create the private bucket: `STORAGE=supabase SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npx tsx scripts/setup-storage.ts` (idempotent; also round-trips a test object through both upload paths).
2. **Vercel** — *Add New → Project* → import the GitHub repo. Environment variables (Production): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_URL` + `NEXT_PUBLIC_SITE_URL` (the site URL), `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service-role secret), `SUPABASE_BUCKET=packages`, `MAX_UPLOAD_MB=50`, `CRON_SECRET` (`openssl rand -hex 24`), `SMTP_*` + `MAIL_FROM`, `ADMIN_EMAILS`, optional `ADMIN_NOTIFY_EMAIL`, `SUBMISSIONS_PER_DAY`. The web tier never evaluates anything, so do **not** set `EVALUATOR` there unless you use the cron option.
3. **Worker** — see §13.
4. **Domain** — when `batterysocbenchmark.ca` is available: Vercel → Domains, then update `AUTH_URL`/`NEXT_PUBLIC_SITE_URL` and move e-mail to Resend (§18).

Vercel builds every push to `main` (`prisma generate && next build`). A failed build never goes live — the previous deployment keeps serving.

**Paid alternative** — `render.yaml` defines a $7/mo always-on Render worker; only useful for the mock evaluator (no MATLAB there).

## 13. Operating the evaluation worker

The worker is the only part that needs care. One instance per machine; add machines to add throughput (jobs are claimed atomically), or `WORKER_CONCURRENCY=n` for parallel runs on one machine (≤ physical cores ÷ 2).

**Prepare the machine** (Windows today; Linux VM later — see `docs/drac-migration.md`)
1. Node 20+, Git, Docker Desktop (enable *Start Docker Desktop when you sign in*), Python 3.11+ with numpy/scipy, MATLAB with the toolboxes submissions commonly need (Signal Processing, Deep Learning, Statistics & ML, Control System, System Identification, Optimization, Curve Fitting). The admin page lists what a machine has.
2. Clone the repo **outside OneDrive**, `npm install`, `docker build -t socbench-eval evaluator`.
3. Obtain `blind_data.mat` from the lab, place it outside the repo, restrict its permissions.
4. Create `.env.production` (git-ignored) with the production `DATABASE_URL`, `DIRECT_URL`, `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`, `NEXT_PUBLIC_SITE_URL`, `SMTP_*`, `MAIL_FROM`, `ADMIN_EMAILS`, plus `EVALUATOR=real`, `SOCBENCH_BLIND_DATA`, `SOCBENCH_PYTHON`, `MATLAB_BIN`, `SOCBENCH_CAL_*`, `EVAL_SANDBOX=docker`.

**Run it**
- Interactive: `npm run worker:prod`. The startup banner tells you the site/db/storage it connects to, the machine specs, Python/MATLAB versions and toolboxes, whether the blinded data is present and whether the Docker sandbox is up. Then `waiting for work…`, one line per claimed job, per progress step, per e-mail, and an idle line every 10 minutes.
- As a service: `scripts\install-worker-task.ps1` (elevated) registers a Scheduled Task that starts at boot/logon, restarts on crash, logs to `worker.log`, and stops the laptop from sleeping on AC. Add `-RunAsUser socbench` to run as a separate low-privilege account (create it and grant read-only permissions first — instructions in the script header).
- Stop: **Ctrl+C** — in-flight evaluations are aborted cleanly (MATLAB killed), their jobs returned to the queue with the attempt refunded, the heartbeat row removed. Never force-kill the process if you can avoid it; if you must, also stop leftover `MATLAB` processes.

**Watch it** — *Admin → Evaluation workers* shows each machine (online/idle/evaluating/paused/offline), diagnostics, its console, the queue with lock ages, and buttons to pause/resume/stop a worker, release a stuck lock or retry a failed job. The Submit page shows users a one-line *Evaluator online/paused* status.

**Update it** — `git pull`, then Ctrl+C and restart. Python-side changes need no restart; Docker image changes need `docker build …` again.

## 14. Configuration reference (environment variables)

Full annotated list in `.env.example`. The important ones:

| Variable | Used by | Meaning |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | web + worker | Postgres (pooled / direct). |
| `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL` | web (+ worker for links in e-mails) | Session signing key; canonical site URL. |
| `STORAGE` = `local` \| `supabase`; `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`; `UPLOAD_DIR`; `MAX_UPLOAD_MB` | web + worker | Where packages live. `local` for development only. |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `ADMIN_NOTIFY_EMAIL` | web + worker | Outgoing mail; unset host = Ethereal test inbox. |
| `ADMIN_EMAILS` | web | Comma-separated administrators. |
| `SUBMISSIONS_PER_DAY` | web | Full evaluations per user per day (default 3, 0 = unlimited). |
| `CRON_SECRET` | web | Bearer token for `/api/jobs/run`. |
| `EVALUATOR` = `mock` \| `real`; `MOCK_EVAL_SECONDS` | worker | Which evaluator. |
| `SOCBENCH_BLIND_DATA`, `SOCBENCH_PYTHON`, `MATLAB_BIN`, `SOCBENCH_CAL_PYTHON`, `SOCBENCH_CAL_MATLAB`, `PY_EVAL_TIMEOUT_MIN`, `DRY_RUN_TIMEOUT_MIN` | worker | Real-evaluator inputs, executables, calibration, timeouts. |
| `EVAL_SANDBOX` = `docker` \| `none`; `EVAL_SANDBOX_IMAGE`; `EVAL_SANDBOX_MATLAB_IMAGE`; `EVAL_MATLAB_LICENSE`; `EVAL_MATLAB_NETWORK`; `EVAL_CPUS`; `EVAL_MEMORY`; `EVAL_PIDS` | worker | Sandbox settings (§11). |
| `WORKER_CONCURRENCY` | worker | Parallel evaluations on one machine. |
| `NEXT_PUBLIC_SITE_TZ` | web | Display timezone (default `America/Toronto`). |

## 15. Troubleshooting

| Symptom | Likely cause → fix |
| --- | --- |
| Submit page says **Evaluator paused**; submissions stay *Queued* | No worker running, or it is holding for Docker. Start `npm run worker:prod`; check the worker terminal/admin page for "sandbox unavailable". |
| Worker prints `Docker is not available — evaluations are ON HOLD` | Docker Desktop is off and could not be started. Start it; enable auto-start at sign-in. |
| A model fails with `Undefined function 'butter'` (or similar) | Missing MATLAB toolbox on the evaluation host; the error names the product. Install it via MATLAB → Add-Ons. |
| `Unknown argument <field>` (Prisma) at runtime after a schema change | The generated client is stale: stop dev server + worker, delete `node_modules/.prisma/client/*.tmp*`, run `npx prisma generate`, restart. |
| A page 404s on Vercel but works locally | The file is ignored by git (check `git check-ignore -v <path>`) or read at runtime without being traced (`outputFileTracingIncludes` in `next.config.ts`). |
| Verification link says invalid though the e-mail just arrived | The account is probably already verified (mail scanner pre-clicked it) — sign in. The two-step confirm page prevents this now. |
| E-mail arrives minutes late at McMaster | Unaligned Gmail sender; fixed by the domain + Resend migration (§18). |
| Results e-mail links to `localhost` | The worker that evaluated it ran with the local `.env`. Only ever run one worker per environment; use `worker:prod` for the live site. |
| Two workers evaluate the same job / a job runs after being cancelled | An old worker process is still alive. Check *Admin → Evaluation workers* and Task Manager; Ctrl+C the extra one. |
| PDF route 500 on Vercel | pdfkit must stay external + traced (`next.config.ts`); do not remove those entries. |

When in doubt: the worker terminal, the job log on the submission page (owners/admins see it), *Admin → Evaluation workers*, and Vercel → Logs (filter `event=`) between them explain almost every problem.

---

# Part 5 — Reference

## 16. Branding and institutional logos

Design follows [brand.mcmaster.ca](https://brand.mcmaster.ca): Heritage Maroon `#7A003C` primary, Gold `#FDBF57` secondary, Grey `#495965` body text, Poppins headings / Arial body, 4 px radii, 1280 px container, WCAG 2.2 / AODA. Tokens live in `src/app/globals.css`; chart colours in `src/components/charts/palette.ts` were validated for colour-vision accessibility. The site has its own wordmark; McMaster and NSERC appear in the funding acknowledgement.

Logos appear in the footer (every page), the About page, the landing-page partner strip, the PDF report header and the e-mail footer, all read from `public/logos/` (paths in `src/lib/logos.ts`):

| File | Used by | Spec |
| --- | --- | --- |
| `mcmaster.svg`, `nserc.svg` | web pages | official SVG, horizontal lockup, transparent |
| `mcmaster.png`, `nserc.png` | PDF report, e-mails (optional) | PNG, transparent, ≥ 600 px wide |

Today the SVGs are text-only wordmarks and the PNGs are absent (PDF/e-mail fall back to text). The marks are trademarked and cannot be redrawn: request McMaster's from Brand Marketing (brandmrk@mcmaster.ca, with approval for the MARC benchmark site) and download NSERC's acknowledgement logo from nserc-crsng.gc.ca. Drop the files in — no code change.

## 17. Other documents

- `docs/security.md` — security status: done / needs a human / open, and accepted residual risks.
- `docs/compliance.md` — mapping to McMaster's Information Security Policy (IS-00), data inventory, §26(b) risk assessment.
- `docs/drac-migration.md` — plan and checklist for moving the worker to a Digital Research Alliance of Canada VM, including the MATLAB sandbox image and firewall rules.
- `.env.example` — every setting, annotated.
- Dataset: https://doi.org/10.5683/SP3/ZVTR4B (Borealis; the archives are git-ignored). Paper: P. J. Kollmeyer, M. Naguib, F. Khanum, A. Emadi, "A Blind Modeling Tool for Standardized Evaluation of Battery State of Charge Estimation Algorithms," IEEE ITEC+EATS 2022, doi:10.1109/ITEC53557.2022.9813996.

## 18. TODO

- [ ] **Domain + Resend for e-mail (high priority).** Gmail (`smtp.gmail.com:587` + App Password) is a stop-gap: ~500 messages/day, sent from a personal address, and — because the sender is not domain-aligned (no SPF/DKIM/DMARC for the benchmark) — Microsoft 365 at McMaster holds results e-mails for minutes and flags them "External". Our side hands mail off in < 5 s; the delay is entirely on the receiving side and only a verified sending domain fixes it.
  1. **Domain**: get DNS access to `batterysocbenchmark.ca` from the lab (whoever registered it), or register a stop-gap domain (any `.ca`/`.com`, ≈ $12/yr) — the sender domain does not have to match the site URL. Point the site at it in Vercel → Domains when ready and update `AUTH_URL` / `NEXT_PUBLIC_SITE_URL`.
  2. **Resend** (free: 3,000/month, 100/day; plain SMTP, no code change): resend.com → *Domains → Add* → add the DKIM TXT, SPF/MX (bounce subdomain) and DMARC records at the registrar → *Verify* → *API Keys → Create* (sending-only).
  3. Set on Vercel **and** in the worker's `.env.production`: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=<api key>`, `MAIL_FROM="Battery SOC Benchmark <no-reply@<domain>>"`; redeploy and restart the worker; send a test from the contact form and a dry-run/evaluation e-mail.
  4. Optional: results e-mail as **link-only** (PDF downloaded from the site) to also bypass M365 Safe-Attachments scanning — one-line change in `src/evaluator/run-job.ts`.
  Alternatives if Resend is unsuitable: Brevo (300/day free, SMTP), Amazon SES (cheapest at scale, more setup), Postmark (paid, best deliverability). Revoke the Gmail app password afterwards.
- [ ] Drop the official McMaster and NSERC assets into `public/logos/` (SVG for web, PNG for PDF/e-mail) once Brand Marketing approves — see §16.
- [x] Parity-tested the CC / EKF / FNN / LSTM example packages: all 21 score columns match the historical `Leaderboard.csv` to 0.000 (2026-08-25).
- [ ] Decide whether the evaluation host ships PyTorch for Python submissions (three archived Python submissions depend on it) — `docker build --build-arg TORCH=1`.
- [ ] Import the 13 historical leaderboard entries (`archive/old-evaluation-tool/Models/Leaderboard.csv`) as legacy submissions.
- [ ] Calibrate `SOCBENCH_CAL_*` on the final evaluation host.
- [ ] Surface the evaluator's `suspicious` flag (mean RMSE > 25 %) and exact-duplicate scores as admin badges instead of silently hiding data (old tool behaviour).
- [ ] Rotate the Gmail app password that is hard-coded in the old tool's `Standardized_Evaluation_Tool_V2.m`.
- [ ] **Migrate the evaluation worker (and possibly hosting) from Ahmad's computer to Digital Research Alliance of Canada resources** via Dr. Kollmeyer's sponsored account — persistent Alliance Cloud VM for the worker, cluster MATLAB / MATLAB Runtime for evaluation, `/project` storage for the blinded data. Plan and checklist: `docs/drac-migration.md`. Info: https://research.mcmaster.ca/free-supercomputing-resources-via-digital-research-alliance-of-canada/
- [ ] Confirm hosting option and file the §26(b) risk assessment (see `docs/compliance.md`).
- [ ] Trim demo users/submissions from `prisma/seed.ts` before seeding production, and delete the `example.edu` demo accounts from the live database (Admin → Users) before announcing the site.
- [ ] **Security follow-ups** — tracked in detail in `docs/security.md`. Human steps still outstanding: rotate the Supabase DB password + service-role key; move repo/`.env.production`/`blind-data` out of OneDrive; run the worker as the low-privilege `socbench` account; build the MATLAB sandbox image on the DRAC VM (host-mode MATLAB packages remain the main residual risk). Not started: cheating-detection badges, session invalidation on password change, admin 2FA, audit log, Dependabot/`npm audit`, weekly `pg_dump` backups, ZAP scan before launch.
