<a id="part-13"></a>
## 13. Appendix: reference tables

### Tools

| Tool | Role | Rationale |
|---|---|---|
| TypeScript, Node.js | Language and runtime for the website and the worker | One typed language for both |
| Next.js 15, React 19 | Web framework | Pages, forms and small APIs in one project |
| Tailwind CSS, Radix UI | Styling; accessible dialogs, menus and tooltips | Rapid development; McMaster colours as design tokens |
| Recharts, TanStack Table | Charts; the leaderboard's headless table | SVG charts with export; sorting and column selection |
| zod | Form validation | One rule set applied in the browser and on the server |
| Auth.js, bcryptjs | Sessions; password hashing | No third-party identity provider required |
| Prisma, PostgreSQL | Database client; the database, on the web host | One schema file; no managed tier |
| nodemailer, Resend | E-mail transport; the mail provider | Provider-independent code; a verified sending domain |
| pdfkit, KaTeX, react-markdown | The PDF report; equations and Markdown on the documentation pages | Vector PDFs without a browser |
| Python 3.12, numpy, scipy | The evaluation pipeline | Exact, fast, licence-free scoring; reads `.mat` files |
| MATLAB R2026a | Executes `.m`/`.p` models only | Inside MathWorks' container image, licensed online |
| Docker | The sandbox | Isolation of untrusted code |
| Caddy | HTTPS in front of the site | Automatic certificates |
| Playwright | Browser tests before a push; the manual's screenshots | Catches rendering failures that type-checking cannot |
| Google Analytics 4 | Usage analytics, off until configured | Read back on Admin → Analytics |
| Arbutus, GitHub Actions | The two machines; the ten-minute health check | All on research or free tiers |

### Environment variables

| Group | Variables |
|---|---|
| Database | `DATABASE_URL`, `DIRECT_URL` |
| Website | `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`, `CRON_SECRET`, `OPS_HEALTH_TOKEN`, `SUBMISSIONS_PER_DAY` |
| Mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ADMIN_NOTIFY_EMAIL` (a fixed list that overrides the per-administrator preferences) |
| Storage | `STORAGE` (local / supabase / remote), `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `STORAGE_REMOTE_URL`, `STORAGE_REMOTE_TOKEN`; `SUPABASE_*` for the retired hosted mode |
| Analytics | `GOOGLE_ANALYTICS_ID`, `GOOGLE_ANALYTICS_DEV_ID`, `GOOGLE_ANALYTICS_API_SECRET` (worker), `GOOGLE_ANALYTICS_PROPERTY_ID`, `GOOGLE_ANALYTICS_SERVICE_ACCOUNT_FILE` (web host) |
| Worker | `SOCBENCH_BLIND_DATA`, `SOCBENCH_PYTHON`, `MATLAB_BIN`, `WORKER_CONCURRENCY`, `WORKER_RUNTIMES` |
| Sandbox | `EVAL_SANDBOX`, `EVAL_SANDBOX_IMAGE`, `EVAL_SANDBOX_MATLAB_IMAGE`, `EVAL_MATLAB_MHLM_FILE`, `EVAL_MATLAB_LICENSE`, `EVAL_MATLAB_NETWORK`, `EVAL_CPUS`, `EVAL_MEMORY`, `EVAL_PIDS` |
| Calibration | `SOCBENCH_CAL_PYTHON`, `SOCBENCH_CAL_MATLAB` |

Every variable is annotated in `.env.example`. Production values exist only in `/etc/socbench/web.env` on the web host and `/etc/socbench/worker.env` on the worker.

### Limits

| Operation | Limit |
|---|---|
| Registration | 5 per hour per address |
| Sign-in | 10 per 15 min per account, 40 per 15 min per IP address |
| Password reset / resend verification | 3 per hour per e-mail address |
| Contact form | 5 per hour per IP address |
| Test runs | 5 per hour (administrators unlimited) |
| Submissions | 3 per rolling 24 h by default, editable 1–100 (administrators exempt) |
| Evaluation / test run | 720 min / 10 min by default; editable 10–1440 and 2–60 |
| Upload | 50 MB zipped |
| Archive | ≤ 500 entries, ≤ 512 MB unpacked, ≤ 256 MB per entry, ≤ 200 : 1 compression ratio, no sub-directories, no symbolic links |
| Model name / description | 50 characters / 80–2000 characters, neither containing an author's name |
| Diagram / write-up | 3 MB PNG, JPEG or WebP / 10 MB PDF, checked by content |
| Page-error e-mails | One per error reference per hour |

### Administrative actions and their safeguards

| Action | Safeguard |
|---|---|
| Moderate a submission | Justification of at least 10 characters; not while RUNNING; contest entries cannot be made private (hide instead); the authors are e-mailed |
| Edit a submission's details or authorship | Only administrators; the no-author-name rule applies; every change is a history entry |
| Bulk deletion | At most 100; RUNNING entries skipped; one activity-log entry; one e-mail per author listing all their removed models |
| Record a legacy score | Headline figures only; badge on the entry; never ranked against current results by mistake |
| Delete a user | Not oneself; not an administrator (demote first); not while the user's work is RUNNING |
| Change a role | Not one's own; the person and every administrator are e-mailed |
| Pause, resume or stop a worker | Applied at the worker's next heartbeat |
| Release a job lock | Behind a confirmation; a live worker would evaluate the job twice |
| Load test | The copies are private and hidden and never reach the leaderboard |
| Evaluation settings | Timeout 10–1440 min, test run 2–60 min, submissions per day 1–100 |
| Scoring weights | Preview required; must sum to 1 |
| Contests | Only one open at a time; results finalised once |

### Principal columns

| Table | Columns of note |
|---|---|
| `User` | `email`, `passwordHash`, `role`, `emailVerified` (a timestamp), profile fields, `adminNotify` preferences, `avatar` |
| `Submission` | `seq` (the visible number), `modelName`, `description`, `paperUrl`, `codeUrl`, `figureKey`, `docKey`, `modelType`, `runtime` (python / matlab), `status`, `version`, `isPrivate`, `isHidden`, `fileKey`, `fileSize`, `unpackedSize`, `shareFiles`, `creditName`, `ownerDisplay`, `isLegacy`, `contestId` |
| `SubmissionCollaborator` | `userId` (null for a named author without an account), `name`, `affiliation`, `acceptedAt`, `inviteToken` |
| `EvaluationJob` | `attempts`, `lockedAt`, `lockedBy`, `log`, `cancelRequestedAt` |
| `EvaluationResult` | `weightedError`, `complexity`, the 18 metric columns, `maxError`, `perCycle`, `timeSeries`, `robustness`, `resourceUsage`, `tracesKey`, `evaluatorVersion` |
| `ScoreRevision` | `kind` (evaluation, reevaluation, failure, rescore, edit, cancelled, legacy), the score and metrics at that moment, `note`, `by`, `log` (the evaluator console of that attempt, administrators only) |
| `WorkerHeartbeat` | `hostname`, `lastSeenAt`, `runtimes`, `busyWith`, `paused`, `command`, machine diagnostics, `gitSha`, `log` |
| `Contest` | `startsAt`, `endsAt`, `registrationEndsAt`, `prizes`, `eligibility`, `maxTeamSize`, `allowedRuntimes`, `winners`, `judgedAt` |
| `DryRun` | its own `status`, lock and `log`; `result` JSON; never touches withheld data, never on the leaderboard |
