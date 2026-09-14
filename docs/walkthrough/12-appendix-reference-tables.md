<a id="part-12"></a>
## 12. Appendix: reference tables

### Tools

| Tool | What it is | Why it was chosen |
|---|---|---|
| TypeScript, Node.js | The language and runtime for the website and the worker | One typed language for both |
| Next.js 15, React 19 | The web framework | Pages, forms and small APIs in one project; free hosting |
| Tailwind CSS, Radix UI | Styling; accessible dialogs, menus, tooltips | Fast to build; McMaster colours as tokens |
| Recharts, TanStack Table | Charts; the leaderboard's headless table | SVG charts with export; sorting and column picking |
| zod | Form validation | One rule set, used in the browser and on the server |
| Auth.js, bcryptjs | Sessions; password hashing | No third-party identity provider needed |
| Prisma, PostgreSQL (Supabase) | Database access; the database | One schema file; free managed tier with file storage attached |
| nodemailer, pdfkit | E-mail; the PDF report | Provider-agnostic mail; vector PDFs without a browser |
| Python, numpy, scipy | The benchmark maths | Exact, fast, no licence to score; reads `.mat` files |
| MATLAB R2026a | Executes `.m`/`.p` models only | Inside MathWorks' container image, licensed online |
| Docker | The sandbox | Non-negotiable isolation for untrusted code |
| Playwright | Browser tests | Runs on every push that touches the site |
| Vercel, Arbutus, GitHub Actions | Website hosting; the worker VM; the 10-minute health ping | All free tiers |

### Environment variables

| Group | Variables |
|---|---|
| Database | `DATABASE_URL` (pooler, port 6543), `DIRECT_URL` (port 5432, migrations only) |
| Website | `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`, `CRON_SECRET`, `OPS_HEALTH_TOKEN` |
| Mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ADMIN_NOTIFY_EMAIL` |
| Storage | `STORAGE` (local / supabase), `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` |
| Worker | `SOCBENCH_BLIND_DATA`, `SOCBENCH_PYTHON`, `MATLAB_BIN`, `WORKER_CONCURRENCY`, `WORKER_RUNTIMES` |
| Sandbox | `EVAL_SANDBOX`, `EVAL_SANDBOX_IMAGE`, `EVAL_SANDBOX_MATLAB_IMAGE`, `EVAL_MATLAB_MHLM_FILE`, `EVAL_MATLAB_NETWORK`, `EVAL_CPUS`, `EVAL_MEMORY` |
| Calibration | `SOCBENCH_CAL_PYTHON`, `SOCBENCH_CAL_MATLAB` |

Every line is annotated in `.env.example`. Production values live only on Vercel and in `/etc/socbench/worker.env` on the VM.

### Limits

| What | Limit |
|---|---|
| Register | 5 per hour per address |
| Login | 10 per 15 min per account, 40 per 15 min per IP |
| Password reset / resend verification | 3 per hour per e-mail |
| Contact form | 5 per hour per IP |
| Upload links | 30 per hour per user |
| Dry runs | 5 per hour (admins unlimited) |
| Submissions | 3 per rolling 24 h (admins exempt) |
| Evaluation / dry run | 360 min / 10 min |
| Zip | ≤ 500 entries, ≤ 512 MB unpacked, ≤ 256 MB per entry, ≤ 200 : 1 compression, no folders, no symlinks |

### Admin actions and their rails

| Action | Rail |
|---|---|
| Moderate a submission | Reason ≥ 10 characters; not while RUNNING; contest entries cannot be made private (hide instead) |
| Bulk delete | Up to 100; RUNNING skipped; one activity line; authors optionally e-mailed |
| Delete a user | Not yourself; not an admin (demote first); not while their work is RUNNING |
| Change a role | Not your own |
| Worker pause / resume / stop | Picked up at the next heartbeat |
| Release a job lock | Behind a confirm — a live worker would double-evaluate |
| Evaluation settings | Timeout 10–1440 min, dry run 2–60 min, per day 1–100 |
| Scoring weights | Preview first; must sum to 1 |
| Contests | Only one open at a time |

### Key columns

| Table | Columns that matter |
|---|---|
| `User` | `email`, `passwordHash`, `role`, `emailVerified` (a timestamp), `adminNotify` toggles, `avatar` |
| `Submission` | `seq` (the visible number), `modelName`, `modelType`, `runtime` (python / matlab), `status`, `version`, `isPrivate`, `isHidden`, `fileKey`, `contestId` |
| `EvaluationJob` | `attempts`, `lockedAt`, `lockedBy`, `log`, `cancelRequestedAt` |
| `EvaluationResult` | `weightedError`, `complexity`, the 18 metric columns, `maxError`, `perCycle`, `timeSeries`, `robustness`, `tracesKey`, `evaluatorVersion` |
| `ScoreRevision` | `kind` (evaluation, failure, rescore, resubmission, edit, cancelled, legacy), the score and metrics at that moment, `note`, `by` |
| `WorkerHeartbeat` | `hostname`, `lastSeenAt`, `runtimes`, `busyWith`, `paused`, `command`, machine diagnostics, `log` |
| `DryRun` | its own `status`, lock and `log`; `result` JSON — never touches hidden data, never on the leaderboard |
