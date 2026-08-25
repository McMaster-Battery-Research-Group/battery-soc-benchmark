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
   - `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` (Resend, Postmark, or the McMaster relay — without these emails go nowhere in production)
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
