# Security — status and remaining work

Last reviewed 2026-08-26. The threat model, layered defences and rationale are summarised in README → *Security model*; the McMaster IS-00 mapping is in `compliance.md`. This file tracks what is **done**, what is **partially done**, and what is still **open**, so nothing is forgotten when the worker moves to DRAC.

## Threat model in one paragraph

The benchmark executes code written by anonymous internet users (`Model.py`, `Model.m`/`.p`). A malicious submission may try to (1) read the blinded dataset — the answer key — or memorise it to fake a perfect score, (2) read the worker's secrets (database, storage, e-mail), (3) exfiltrate data or use the evaluation host as a foothold, (4) exhaust the evaluation queue. The web tier faces the usual credential-stuffing, spam and injection risks. Everything below exists to contain (1)–(4).

## Done

| Area | Control | Where |
| --- | --- | --- |
| Sandbox | Per-evaluation Docker container: `--network none`, read-only root, `--cap-drop ALL`, `no-new-privileges`, cpu/memory/pid limits, unprivileged uid, only package (ro) / blinded data (ro, real runs only) / output dir mounted, **no host env** | `src/evaluator/python-evaluator.ts`, `evaluator/Dockerfile` |
| Host fallback | Allow-listed environment (no `DATABASE_URL`, `SUPABASE_SERVICE_KEY`, `SMTP_PASS`, `AUTH_SECRET`) when running outside Docker | `python-evaluator.ts` (`HOST_ENV_ALLOW`) |
| Process control | Timeouts, cancel and shutdown kill the whole process tree incl. MATLAB (`taskkill /T`, process groups, `docker kill`) | `python-evaluator.ts`, `run-job.ts`, `worker.ts` |
| Package hygiene | Zip-slip / symlink / entry-count / size / compression-ratio checks on upload and again before extraction; top-level files only | `src/lib/package-check.ts`, `socbench_eval/__main__.py` |
| Storage | Private Supabase bucket; short-lived signed upload URLs for signed-in users; reads need the service key; objects deleted after evaluation; strict key pattern accepted from the browser | `src/lib/storage.ts`, `src/app/api/upload/route.ts` |
| Rate limits | DB-backed sliding windows: login (per account + per IP), register, password reset, verification e-mail, contact form, upload URLs; per-user daily submission cap; dry-run quota | `src/lib/rate-limit.ts`, `src/lib/dry-run-quota.ts` |
| Web headers | CSP, HSTS, nosniff, `frame-ancestors 'none'`, referrer & permissions policies, no `X-Powered-By` | `next.config.ts` |
| Auth | bcrypt (cost 11), e-mail verification required, JWT sessions (14 d), per-object authorization on every action, invitee-only collaborator responses, admin allow-list via `ADMIN_EMAILS` | `src/lib/auth*.ts`, server actions |
| Cron endpoint | Secret in `Authorization` header only, constant-time compare | `src/app/api/jobs/run/route.ts` |
| E-mail | Display-name addressing, no user-controlled HTML (escaped in feedback mail) | `src/lib/mail.ts` |
| Ops | Worker heartbeat + admin visibility (machines, logs, queue), graceful shutdown, scheduled-task installer that can run as a low-privilege account | `/admin/workers`, `scripts/install-worker-task.ps1` |

## Partially done — needs a human step

- [ ] **Rotate the Supabase database password and service-role key** (both were pasted in a chat while setting up). Supabase → Settings → Database / API. Then update `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_KEY` on Vercel **and** in the worker's `.env.production` together.
- [ ] **Move the repo, `.env.production` and `blind-data/` out of OneDrive** (any synced/shared folder). Secrets and the answer key must not replicate to cloud storage or other devices.
- [ ] **Run the worker as a dedicated low-privilege Windows account** (`socbench`): create the user, grant read-only ACLs to the repo / `.env.production` / `blind-data`, add it to `docker-users`, grant "Log on as a batch job", then `scripts\install-worker-task.ps1 -RunAsUser socbench`. Until this is done, MATLAB packages (host mode) run with Ahmad's full user rights.
- [x] (done 2026-08-28 on the Arbutus VM: `socbench-eval-matlab` on the MathWorks deep-learning image, online licensing via a per-evaluation 24 h access token; MATLAB containers use `--network bridge` for the licence check-out — egress allow-list still todo) **MATLAB inside the sandbox.** `evaluator/Dockerfile.matlab` (MathWorks base image + toolboxes via `mpm`) works on Linux x86-64 only and needs a licence server (`EVAL_MATLAB_LICENSE`). Plan: build it on the DRAC VM; until then `.m/.p` packages run on the host under the allow-listed env + low-privilege account.
- [ ] **Install the MATLAB toolboxes** submissions commonly need on the current host (Signal Processing, Deep Learning, Statistics & ML, Control System, System Identification, Optimization, Curve Fitting) — functional, not security, but the admin page's toolbox list is the way to verify.
- [ ] **Domain + Resend for e-mail** (see README → TODO for the step list): verified sending domain with SPF/DKIM/DMARC replaces the personal Gmail sender — fixes the multi-minute delivery delay into McMaster mailboxes and removes a personal credential from the service. Afterwards revoke the Gmail app password and rotate the one hard-coded in the archived `Standardized_Evaluation_Tool_V2.m`.

## Open — not started

- [ ] **Cheating detection (memorised blinded data).** Technical sandboxing cannot stop a model that already contains the answers. Add admin badges for: implausibly low error on the blinded m448 cell relative to the open cells, near-zero error on every cycle, exact duplicate score vectors across submissions, and the old tool's `suspicious` flag (mean RMSE > 25 %). Consider requiring source (`Model.m` rather than `Model.p`) for contest winners and a manual review step before prizes.
- [ ] **Session invalidation on password change/reset.** JWTs stay valid for 14 days; add a `sessionVersion` on `User`, embed it in the token, bump it on password change, and reject stale tokens in `auth()` (the edge middleware cannot query the DB, so enforce in server code).
- [ ] **Two-factor for administrators** (TOTP) — admins can hide submissions, change roles and read every user's data.
- [ ] **Audit log** for admin actions (role changes, hide/unhide, retries, worker commands) — currently only in Vercel function logs.
- [ ] **Dependency hygiene**: enable Dependabot/Renovate on the GitHub repo, run `npm audit` in CI, pin the sandbox base images by digest and rebuild monthly.
- [ ] **Backups**: Supabase free tier has no automatic backups — schedule a weekly `pg_dump` (GitHub Action with a repository secret) to a private bucket; test a restore once.
- [ ] **Secrets management on the worker**: replace `.env.production` with Windows Credential Manager / DPAPI-protected file, or a secrets file with `icacls` restricted to `socbench` only.
- [ ] **Content review of profile fields**: names, bios and links are user-controlled and shown publicly — React escapes them, but add link-host validation (done for the research IDs) to `website` and consider a report/hide control for admins.
- [~] **Egress policy for the DRAC VM** — inbound is default-deny (ufw + security group); outbound is still unrestricted (Supabase/SMTP allow-list not yet applied). Original item:: firewall default-deny inbound; outbound only to Supabase, SMTP and the MATLAB licence server. Document in `drac-migration.md` and apply with `ufw`.
- [ ] **Penetration-style review before public launch**: OWASP ZAP baseline scan against the Vercel deployment; try a malicious package (network call, file read of `/data`, `os.environ` dump) through a dry run and confirm it fails inside the sandbox.
- [ ] **Privacy page**: mention rate-limit logging (IP addresses retained ≤ 24 h in `RateLimitHit`) and the container-based processing of uploaded code.

## Residual risks accepted for now

- ~~Host-mode MATLAB evaluation can read the blinded data and the worker account's files until the MATLAB container exists on DRAC.~~ Resolved 2026-08-28: MATLAB runs in the sandbox on the VM. Mitigated by the low-privilege account and allow-listed environment; the data is also only useful to a submitter who can *exfiltrate* it, which the account/firewall limits but does not eliminate.
- A determined cheat can still embed answers in a model; detection is statistical (see Open).
