# Battery SOC Benchmark

Web platform for the McMaster Automotive Resource Centre's **Blind Modeling Tool** — standardized, blinded evaluation of battery state-of-charge (SOC) estimation algorithms on the Tesla Model 3 2170 cell dataset, with a public leaderboard, model comparison, and time-boxed prize contests.

Built with Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma + PostgreSQL · Auth.js.

## Quick start

```bash
cp .env.example .env            # defaults work for local dev
npm install
npm run setup                   # Postgres in Docker (port 5433) + schema + seed data
npm run dev                     # http://localhost:3000
npm run worker                  # in a second terminal: processes evaluation jobs
```

(`npm run setup` = `db:up` + `prisma db push` + `seed`. Run commands on separate lines in Windows PowerShell 5.1 — it does not support `&&`; npm scripts do.)

Seeded accounts (password for all: see `.env` / `Password1`):

| Role  | Email                                  | Password    |
| ----- | -------------------------------------- | ----------- |
| Admin | `admin@batterysocbenchmark.ca`         | `Admin123!` |
| User  | `a.rahman@example.edu` (and others)    | `Password1` |

Without `SMTP_HOST`, emails go to an auto-created Ethereal inbox and the preview URL is printed in the terminal that runs `npm run dev` / `npm run worker`.

## What's here

| Area | Path |
| --- | --- |
| Landing, dataset, methodology, help, about, contact, contests, legal | `src/app/(marketing)/`, `src/app/page.tsx` |
| Auth (register / verify / login / reset) | `src/app/(auth)/`, `src/lib/auth.ts`, `src/middleware.ts` |
| Leaderboard, compare, submit, my submissions, submission detail, profile | `src/app/(app)/` |
| Admin (overview, submissions, contests, users, messages) | `src/app/(admin)/admin/` |
| Brand tokens (McMaster maroon/gold/grey, Poppins/Arial) | `src/app/globals.css` |
| UI kit | `src/components/ui/` |
| Charts (validated palette) | `src/components/charts/` |
| LaTeX equations (KaTeX, server-rendered) | `src/components/math.tsx`, used by the model schematic and Methodology |
| PDF report (pdfkit, vector charts; download + e-mail attachment) | `src/lib/report.ts`, `src/app/api/submissions/[id]/report.pdf/route.ts` |
| Test-case definitions + official weights | `src/lib/test-cases.ts`, `src/lib/scoring.ts` |
| Submission package checks (zip structure, `Model.m`/`.p`/`.py`, signature) | `src/lib/package-check.ts` |
| Evaluator seam | `src/evaluator/` |
| Schema / seed | `prisma/` |

## The evaluator (MATLAB **and** Python submissions)

`evaluator/python/socbench_eval` **is** the benchmark: ~450 lines of numpy that reproduce the lab's original Standardized Evaluation Tool exactly (verified on the real blinded data: the CC, EKF, FNN and LSTM example packages reproduce every column of the lab's historical leaderboard to 0.000) — 1-hour constant padding, validation on m80 UDDS @ 10 °C with +0.3 A, 144 blinded cycles + charge cycles, positional temperature means, initial-SOC (90/60/30 %) and current-offset (±0.05/0.1/0.3 A) sweeps, the published weights, ⅓-decade complexity bins.

The only runtime-specific part is *executing the model*:

| Package contains | Executed by | Needs |
| --- | --- | --- |
| `Model.py` | Python, in-process | numpy/scipy only |
| `Model.m` / `Model.p` | one MATLAB session via `matlab/Run_Model.m` (~40 lines) | MATLAB on the evaluation host |

Layout:

```
evaluator/python/socbench_eval/   the benchmark (data.py, runner.py, pipeline.py, __main__.py)
matlab/Run_Model.m                executes a MATLAB model on a batch of inputs — nothing else
matlab/Export_Blind_Data.m        one-time export of the lab's Data_m*.mat tables → blind_data.mat
blind-data/                       blind_data.mat (gitignored; evaluation host only)
```

**Set up an evaluation host**

```bash
pip install -r evaluator/python/requirements.txt
# .env on the worker host
EVALUATOR=real
SOCBENCH_BLIND_DATA=<path>/blind-data/blind_data.mat
SOCBENCH_PYTHON=python
MATLAB_BIN="C:/Program Files/MATLAB/R2026a/bin/matlab.exe"   # only for Model.m/.p
npm run worker
```

Run by hand: `cd evaluator/python && python -m socbench_eval package.zip outDir --data ../../blind-data/blind_data.mat [--runtime python|matlab]`.

**Example packages** — `evaluator/examples/<slug>.{matlab,python}.zip` are runnable reference submissions (Coulomb counter, EKF, FNN, LSTM; the Python FNN/LSTM carry weights extracted from the lab's MATLAB sources into `weights.npz`). The Examples page shows both listings with a MATLAB/Python toggle, offers the zips for download (`/examples/download/<file>`), and can queue a dry run of any of them with one click. Rebuild them with the script in the session scratchpad (`build_examples.py`) if the sources change. All eight give identical open-cycle RMSE across runtimes (0.172 / 0.076 / 1.463 / 2.009 %).

**Dry runs ("Test your package first")** — the Submit page lets a signed-in user run a package through the same evaluator on one *open* cycle (`evaluator/python/dryrun_data.mat`: m80 REORDERED1 @ 25 °C, first 2 h, from the public Borealis data): +0.3 A validation, then the padded cycle. Returns pass/fail with the error message, RMSE/MAE/max error on that cycle, complexity bin and a trace. Never touches blinded data, creates no submission, limited to 5/hour/user, and jumps the evaluation queue. CLI: `python -m socbench_eval package.zip outDir --dry-run`. This replaces the old downloadable MATLAB "Model Submission Test Tool".

Complexity is time-per-sample normalised by `SOCBENCH_CAL_PYTHON` / `SOCBENCH_CAL_MATLAB` (seconds per sample of a plain Coulomb counter on that host) so both runtimes bin the same model the same way; recalibrate when the evaluation host changes.

The original tool (daemon, figures, e-mail, `Leaderboard.csv`) and the Borealis download live in `../Battery-SOC-Benchmark-archive/` — nothing in the repo depends on them.

## Branding

Design follows [brand.mcmaster.ca](https://brand.mcmaster.ca) (Heritage Maroon `#7A003C` primary, Gold `#FDBF57` secondary, Grey `#495965` body text, Poppins headings / Arial body, 4 px radii, 1280 px container, WCAG 2.2 / AODA). The site has its own wordmark; McMaster and NSERC appear in the funding acknowledgement.

### Institutional logos (McMaster + NSERC)

Logos appear in the site footer (every page), the About page, the landing-page partner strip, the PDF report header and the e-mail footer. All of them read from one place, `public/logos/` (paths in `src/lib/logos.ts`):

| File | Used by | Spec |
| --- | --- | --- |
| `mcmaster.svg`, `nserc.svg` | web pages | official SVG, horizontal lockup, transparent |
| `mcmaster.png`, `nserc.png` | PDF report, e-mails (optional) | PNG, transparent, ≥ 600 px wide |

Today the two SVGs are **text-only wordmarks** and the PNGs are absent, so the PDF and e-mails fall back to a text acknowledgement. Drop the official files in and everything picks them up — no code change.

Obtaining them (the lab must do this — the marks are trademarked and cannot be redrawn):
- **McMaster** — request the logo files and approval for the MARC benchmark site from Brand Marketing, brandmrk@mcmaster.ca (https://brand.mcmaster.ca → *Logos*). Rules baked into the layout: ≥ 100 px wide on desktop / 75 px mobile, clear space around it, never recoloured or placed on busy backgrounds.
- **NSERC** — download the official *acknowledgement* logo (EN/FR, colour, horizontal) from https://www.nserc-crsng.gc.ca/Professors-Professeurs/Logos-Logos_eng.asp and follow its "Acknowledging NSERC" wording, which the site already uses.

## TODO

- [ ] **Email: switch from Gmail to Resend once a domain is available.** Gmail (`smtp.gmail.com:587` + App Password) is a stop-gap: ~500 messages/day, mail is sent from the personal address, and a personal account shouldn't back a public service. When `batterysocbenchmark.ca` DNS is accessible: verify the domain in Resend (DKIM/SPF records), create an API key, and set `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<api key>`, `MAIL_FROM="Battery SOC Benchmark <no-reply@batterysocbenchmark.ca>"` on Vercel and the Render worker. No code change.
- [ ] Drop the official McMaster and NSERC assets into `public/logos/` (SVG for web, PNG for PDF/e-mail) once Brand Marketing approves — see *Institutional logos* above.
- [x] Parity-tested the CC / EKF / FNN / LSTM example packages: all 21 score columns match the historical `Leaderboard.csv` to 0.000 (2026-08-25).
- [ ] Decide whether the evaluation host ships PyTorch for Python submissions (three archived Python submissions depend on it).
- [ ] Import the 13 historical leaderboard entries (`archive/old-evaluation-tool/Models/Leaderboard.csv`) as legacy submissions.
- [ ] Calibrate `SOCBENCH_CAL_*` on the final evaluation host.
- [ ] Surface the evaluator's `suspicious` flag (mean RMSE > 25 %) and exact-duplicate scores as admin badges instead of silently hiding data (old tool behaviour).
- [ ] Rotate the Gmail app password that is hard-coded in the old tool's `Standardized_Evaluation_Tool_V2.m`.
- [ ] **Migrate the evaluation worker (and possibly hosting) from Ahmad's computer to Digital Research Alliance of Canada resources** via Dr. Kollmeyer's sponsored account — persistent Alliance Cloud VM for the worker, cluster MATLAB / MATLAB Runtime for evaluation, `/project` storage for the blinded data. Plan and checklist: `docs/drac-migration.md`. Info: https://research.mcmaster.ca/free-supercomputing-resources-via-digital-research-alliance-of-canada/
- [ ] Confirm hosting option and file the §26(b) risk assessment (see `docs/compliance.md`).
- [ ] Trim demo users/submissions from `prisma/seed.ts` before seeding production.

## Scripts

`dev` · `build` · `start` · `lint` · `typecheck` · `db:up` · `db:push` · `db:migrate` · `db:studio` · `seed` · `worker`

## Dataset archives

The Borealis archives (`0-Documentation.zip` … `4-SOC estimation Model Examples.zip`) are git-ignored; download them from https://doi.org/10.5683/SP3/ZVTR4B.

## Deployment

Zero-cost layout for the mock-evaluator phase; the paid Render option is kept in `render.yaml` if you ever want an always-on cloud worker.

| Piece | Where | Cost |
| --- | --- | --- |
| Next.js web app | **Vercel** (Hobby) | free |
| PostgreSQL | **Supabase** (free project, 500 MB) | free |
| Submission packages | **Supabase Storage** (private bucket, same project; 1 GB free) | free |
| Evaluation | **either** `npm run worker` on your laptop / a lab PC (required later for MATLAB) **or** a free cron hitting `/api/jobs/run` (mock only) | free |

### 1. Supabase
1. https://supabase.com → New project (region: Canada Central if offered, else US East). Save the database password.
2. Project → **Connect** (top bar) → *ORMs → Prisma* shows two URLs:
   - `DATABASE_URL` = **Transaction pooler** URL (port **6543**) with `?pgbouncer=true` appended
   - `DIRECT_URL` = **Session/direct** URL (port **5432**)
   Replace `[YOUR-PASSWORD]` in both.
3. From your machine (PowerShell):
   ```powershell
   $env:DATABASE_URL="<pooler url>?pgbouncer=true"; $env:DIRECT_URL="<direct url>"
   npx prisma db push
   npm run seed        # trim demo data in prisma/seed.ts first if you want a clean launch
   ```

### 2. Vercel
1. https://vercel.com → **Add New → Project** → import `AhmadAli137/battery-soc-benchmark`.
2. Environment variables (Production):
   `DATABASE_URL`, `DIRECT_URL` (from Supabase) · `AUTH_SECRET` (`openssl rand -base64 32`) · `AUTH_URL` + `NEXT_PUBLIC_SITE_URL` (your Vercel URL) · `STORAGE=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (service-role secret) + `SUPABASE_BUCKET=packages` · `MAX_UPLOAD_MB=50` · `CRON_SECRET` (`openssl rand -hex 24`) · `SMTP_*` + `MAIL_FROM` · `ADMIN_EMAILS` (comma-separated administrators: auto-promoted, no dry-run limit, Admin badge) · `ADMIN_NOTIFY_EMAIL` (optional; feedback-form notifications).
   Only add `EVALUATOR=mock` + `MOCK_EVAL_SECONDS=4` if you use the cron endpoint (option B below); with a real worker the web tier never evaluates anything.
3. Create the private bucket once from your machine: `STORAGE=supabase SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npx tsx scripts/setup-storage.ts` (idempotent; also round-trips a test object). Then deploy.

### 3. Evaluation — pick one
- **Laptop / lab PC worker** (run exactly one — a second stale worker with different env will steal jobs) — copy the production `DATABASE_URL`, `DIRECT_URL`, `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SMTP_*`, `NEXT_PUBLIC_SITE_URL` plus the evaluator settings (`EVALUATOR=real`, `SOCBENCH_*`, `MATLAB_BIN`) into a local `.env.production` (git-ignored), then `npm run worker:prod`. `npm run worker` keeps using `.env` for local development. Outbound-only; works behind campus VPN. This is the path for MATLAB later.
  - **Keeping a Windows laptop worker alive:** `scripts\install-worker-task.ps1` (run once, elevated) registers a Scheduled Task that starts the worker at logon, restarts it on crash, logs to `worker.log`, and sets the power plan to never sleep on AC (lid closed = nothing). The worker writes a heartbeat every 15 s; the Submit page shows **Evaluator online / paused**, and queued submissions show their queue position and "will start automatically when the machine is back". Nothing inbound is required — the laptop only makes outbound connections (Postgres, Supabase Storage, SMTP), so any network/VPN works.
- **Free cron (mock only)** — https://cron-job.org (free) → new job → URL `https://<your-site>/api/jobs/run?secret=<CRON_SECRET>` every 1 minute. Each call drains the queue for up to 45 s. Submissions then complete within ~1 minute with no worker running anywhere.

### Paid alternative — Render worker
`render.yaml` defines a $7/mo background worker (and, commented out, Render Postgres). Only worth it if nobody can keep a machine on and the cron endpoint isn't acceptable.

### Ops notes
- Scaling evaluation: run `npm run worker` on more machines — jobs are claimed atomically, nothing else to configure. `WORKER_CONCURRENCY=n` runs n evaluations in parallel on one machine (CPU-bound; ≤ physical cores / 2). **Admin → Evaluation workers** (`/admin/workers`) lists every machine with live diagnostics (CPU/memory/disk, Python/MATLAB/blinded-data checks, code version, completed/failed counts), the last 200 console lines of each, the queue with lock ages, and pause / resume / stop / release-lock / retry controls.
- Real evaluation: set `EVALUATOR=real` on the worker host (needs Python + `socbench_eval`, MATLAB for `.m/.p` packages, and `SOCBENCH_BLIND_DATA` pointing at the blinded `.mat` — see *The evaluator*). The worker calls `storage.materialize()` so the package is always a local file regardless of storage mode. The cron endpoint only works with the mock evaluator.
- Packages live in a **private** Supabase bucket: the browser uploads through a signed URL issued by `/api/upload` (signed-in users only), only the service key can read, and the object is deleted as soon as evaluation completes. Swap `SupabaseStorage` for S3/R2 if ever needed — only `src/lib/storage.ts` changes.
- Backups: Supabase free tier has no automatic backups — schedule `pg_dump` (e.g. weekly GitHub Action) or upgrade.
