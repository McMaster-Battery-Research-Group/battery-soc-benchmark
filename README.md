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
| Test-case definitions + official weights | `src/lib/test-cases.ts`, `src/lib/scoring.ts` |
| Submission package checks (zip structure, `Model.m`, `Settings.xlsx`) | `src/lib/package-check.ts` |
| Evaluator seam | `src/evaluator/` |
| Schema / seed | `prisma/` |

## Swapping in the MATLAB evaluator

The web app never runs models itself. `src/evaluator/worker.ts` polls the `EvaluationJob` table and hands each job to whatever `getEvaluator()` returns (`EVALUATOR=mock|matlab`).

1. Implement `MatlabEvaluator.evaluate()` in `src/evaluator/matlab-evaluator.ts`:
   - unzip the package at `input.filePath` into the evaluator's working directory;
   - spawn MATLAB / MATLAB Runtime with the lab's blind evaluation script, streaming stdout to `input.log()`;
   - parse the produced leaderboard row, per-cycle error summary (RMSE/MAE/MAXE + time series) and map to `EvaluationOutput` (`src/evaluator/types.ts`). Compute `weightedError` with `lib/scoring.ts` so the site and the script agree.
2. Set `EVALUATOR=matlab` in the worker's environment and run `npm run worker` on the machine that has MATLAB.
3. Throw `EvaluationError(message)` for user-facing failures (bad model output, runtime exceeded); anything else is retried once, then marked failed.

The per-test-case columns on `EvaluationResult` follow Table IV of the ITEC 2022 paper and the V2 "Output Data" weights (`src/lib/test-cases.ts`). If the lab's script emits additional cases, add a column + a `TEST_CASES` entry and everything (leaderboard, charts, docs, CSV/JSON export) picks it up.

## Branding

Design follows [brand.mcmaster.ca](https://brand.mcmaster.ca) (Heritage Maroon `#7A003C` primary, Gold `#FDBF57` secondary, Grey `#495965` body text, Poppins headings / Arial body, 4 px radii, 1280 px container, WCAG 2.2 / AODA). The site has its own wordmark; McMaster and NSERC appear in the funding acknowledgement.

`public/logos/mcmaster.svg` and `public/logos/nserc.svg` are **text-only wordmarks** in brand typography — McMaster's terms allow the institutional logo only with files and approval from Brand Marketing (brandmrk@mcmaster.ca), so no crest/Marauder is reproduced. Drop the official assets over these two files when the lab supplies them; nothing else needs to change.

## TODO

- [ ] **Email: switch from Gmail to Resend once a domain is available.** Gmail (`smtp.gmail.com:587` + App Password) is a stop-gap: ~500 messages/day, mail is sent from the personal address, and a personal account shouldn't back a public service. When `batterysocbenchmark.ca` DNS is accessible: verify the domain in Resend (DKIM/SPF records), create an API key, and set `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<api key>`, `MAIL_FROM="Battery SOC Benchmark <no-reply@batterysocbenchmark.ca>"` on Vercel and the Render worker. No code change.
- [ ] Replace text-only wordmarks in `public/logos/` with official McMaster and NSERC assets once approved.
- [ ] Implement `MatlabEvaluator` when the lab's script arrives; set `EVALUATOR=matlab` on the worker host.
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
| Submission packages | **Vercel Blob** (Hobby includes 1 GB) | free |
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
   `DATABASE_URL`, `DIRECT_URL` (from Supabase) · `AUTH_SECRET` (`openssl rand -base64 32`) · `AUTH_URL` + `NEXT_PUBLIC_SITE_URL` (your Vercel URL) · `STORAGE=blob` · `MAX_UPLOAD_MB=50` · `EVALUATOR=mock` · `MOCK_EVAL_SECONDS=4` · `CRON_SECRET` (`openssl rand -hex 24`) · `SMTP_*` + `MAIL_FROM`.
3. Deploy. Then **Storage → Create → Blob → Connect to project** (adds `BLOB_READ_WRITE_TOKEN`); redeploy once.

### 3. Evaluation — pick one
- **Laptop / lab PC worker** — copy the production `DATABASE_URL`, `DIRECT_URL`, `STORAGE=blob`, `BLOB_READ_WRITE_TOKEN`, `SMTP_*`, `NEXT_PUBLIC_SITE_URL` into a local `.env.production`, then `npx dotenv -e .env.production -- npm run worker` (or just edit `.env`). Outbound-only; works behind campus VPN. This is the path for MATLAB later.
- **Free cron (mock only)** — https://cron-job.org (free) → new job → URL `https://<your-site>/api/jobs/run?secret=<CRON_SECRET>` every 1 minute. Each call drains the queue for up to 45 s. Submissions then complete within ~1 minute with no worker running anywhere.

### Paid alternative — Render worker
`render.yaml` defines a $7/mo background worker (and, commented out, Render Postgres). Only worth it if nobody can keep a machine on and the cron endpoint isn't acceptable.

### Ops notes
- Scaling evaluation: run more worker instances — jobs are claimed atomically.
- Switching to MATLAB: set `EVALUATOR=matlab` on the worker host and implement `src/evaluator/matlab-evaluator.ts`. The worker calls `storage.materialize()` so the package is always a local file regardless of storage mode. The cron endpoint is not suitable for MATLAB.
- Blob objects are public-but-unguessable URLs (random suffix) and are deleted as soon as evaluation completes; swap `BlobStorage` for S3/R2 if stricter handling is required — only `src/lib/storage.ts` changes.
- Backups: Supabase free tier has no automatic backups — schedule `pg_dump` (e.g. weekly GitHub Action) or upgrade.

## TODO

- [ ] **Email: switch from Gmail to Resend once a domain is available.** Gmail (`smtp.gmail.com:587` + App Password) is a stop-gap: ~500 messages/day, mail is sent from the personal address, and a personal account shouldn't back a public service. When `batterysocbenchmark.ca` DNS is accessible: verify the domain in Resend (DKIM/SPF records), create an API key, and set `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<api key>`, `MAIL_FROM="Battery SOC Benchmark <no-reply@batterysocbenchmark.ca>"` on Vercel and the Render worker. No code change.
- [ ] Replace text-only wordmarks in `public/logos/` with official McMaster and NSERC assets once approved.
- [ ] Implement `MatlabEvaluator` when the lab's script arrives; set `EVALUATOR=matlab` on the worker host.
- [ ] Confirm hosting option and file the §26(b) risk assessment (see `docs/compliance.md`).
- [ ] Trim demo users/submissions from `prisma/seed.ts` before seeding production.

## Scripts

`dev` · `build` · `start` · `lint` · `typecheck` · `db:up` · `db:push` · `db:migrate` · `db:studio` · `seed` · `worker`

## Dataset archives

The Borealis archives (`0-Documentation.zip` … `4-SOC estimation Model Examples.zip`) are git-ignored; download them from https://doi.org/10.5683/SP3/ZVTR4B.

## Deployment (Vercel + Render)

The app is split in two because the evaluator must run continuously and (later) next to MATLAB, while the website is a good fit for serverless.

| Piece | Where | Why |
| --- | --- | --- |
| Next.js web app | **Vercel** | serverless, edge middleware, Blob storage for uploads |
| PostgreSQL | **Render** (managed) | one database shared by web + worker |
| Evaluation worker (`npm run worker`) | **Render** background worker | always on; polls the queue; later the MATLAB host |
| Submission packages | **Vercel Blob** | browser uploads directly (Vercel caps request bodies at ~4.5 MB); worker downloads by URL; deleted after evaluation |

### 1. Render — database + worker
1. Push the repo to GitHub. In Render choose **New → Blueprint** and point it at the repo; `render.yaml` creates `socbench-db` and `socbench-worker`.
2. Fill the `sync: false` env vars when prompted (`BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_SITE_URL`, SMTP). You can add the Blob token after step 2 below.
3. Copy the database's **External connection string** — you need it for Vercel and for the one-off schema push.

### 2. Vercel — web app + Blob
1. **Add New → Project**, import the repo. Framework: Next.js (auto). `vercel.json` sets `prisma generate && next build`.
2. **Storage → Create Database → Blob**, attach it to the project; Vercel injects `BLOB_READ_WRITE_TOKEN`. Copy that token into the Render worker's env.
3. Project **Settings → Environment Variables**:
   - `DATABASE_URL` = Render external connection string (append `?sslmode=require` if not present)
   - `AUTH_SECRET` = `openssl rand -base64 32`
   - `AUTH_URL` and `NEXT_PUBLIC_SITE_URL` = `https://<your-domain>`
   - `STORAGE=blob`, `MAX_UPLOAD_MB=50`
   - `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` — free option: **Brevo** (`smtp-relay.brevo.com:587`, login email + SMTP key, `MAIL_FROM` = a sender you verified in Brevo; 300/day). Later: Resend/Postmark with the domain verified, or the RHPCS relay `mbox.mcmaster.ca`. Without SMTP, production emails go nowhere.
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (only used by the seed)
4. Deploy. Then add your domain (e.g. `batterysocbenchmark.ca`) under **Domains** and update the two URL vars.

### 3. Schema + first admin
From your machine, with `DATABASE_URL` pointing at Render:
```bash
npx prisma db push
npm run seed          # or create just the admin and skip sample data
```
Remove the sample users/submissions from the seed before running it against production if you don't want demo data on the public leaderboard.

### Ops notes
- Scaling evaluation: run more worker instances — jobs are claimed atomically.
- Switching to MATLAB: set `EVALUATOR=matlab` on the worker host and implement `src/evaluator/matlab-evaluator.ts`. The worker calls `storage.materialize()` so the package is always a local file path regardless of storage mode.
- Blob objects are public-but-unguessable URLs (random suffix) and are deleted as soon as evaluation completes; for stricter handling switch `access` to private once your Blob plan supports it, or swap `BlobStorage` for S3/R2 — only `src/lib/storage.ts` changes.
- Backups: enable point-in-time recovery on the Render Postgres plan you choose.
