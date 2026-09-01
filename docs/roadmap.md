# Roadmap — open improvements

Kept current so "what's pending?" has one answer. Last updated 2026-08-31, evening (tracker items 1–14 resolved; polish batch shipped). Detailed security items live in `security.md`; tracker resolutions in `issue-tracker-2026-08-28.csv`.

## Launch blockers

1. **Domain + Resend for e-mail** — Gmail app-password sending is capped (~500/day), lands in spam at McMaster, and is tied to a personal account. Needs the `batterysocbenchmark.ca` decision (human), then DNS + API key (~1 h). Step list in README → TODO.
2. **Rotate Supabase DB password + service-role key**, then remove `.env.production` and `blind-data/` from the laptop/OneDrive — the VM is the only host that needs them now. (Human: Supabase → Settings; then update `/etc/socbench/worker.env`.)
3. **Delete demo data** — `example.edu` accounts, seeded rows, and the ~20 private "Arbutus smoke/parity/timing/traces" test submissions (bulk delete on Admin → Submissions makes this quick); trim `prisma/seed.ts`.
4. **Official McMaster + NSERC logos** — waiting on the Brand Marketing request (tracker #4, PJK).

## Security (see security.md for the full list)

5. **Weekly DB backup** — Supabase free tier has no backups; a scheduled `pg_dump` (GitHub Action → private bucket) is the cheapest insurance. Top security priority.
   - ✅ *Worker outage alerting shipped 2026-09-01* — GitHub Action pings `/api/ops/worker-health` every 10 min; admins e-mailed once per outage/recovery ("Worker outages" toggle). See drac-migration.md → Outage alerting.
6. Session invalidation on password change/reset; **2FA for administrators**.
7. VM egress allow-list (outbound currently unrestricted; should be Supabase + SMTP + MathWorks licensing only).
8. **Cheating/duplicate handling** — surface the evaluator's `suspicious` flag (mean RMSE > 25 %) and exact-duplicate scores as admin badges; PJK to decide whether to withhold results like the old tool did (evaluator-vs-original-tool.md §8).
9. Dependabot + pinned sandbox image digests; OWASP ZAP baseline scan before public launch.

## Features

10. **Import the 13 historical leaderboard entries** as legacy submissions (CSV is in the Blind Model Files folder).
11. **PyTorch in the Python sandbox** (`--build-arg TORCH=1`, ~800 MB) — three archived submissions need it; needs a yes/no.
12. **Hardware deployment for true complexity** — compile models via Simulink onto a microcontroller (C2000/F28379D route; Atjen's paper) for processor time/RAM/flash. Agreed future work with PJK.

## Housekeeping

13. Compliance: §26(b) risk assessment; privacy page notes on rate-limit IP logging and container processing.
14. Rotate the Gmail app password hard-coded in the old tool's `Standardized_Evaluation_Tool_V2.m` (the folder has been shared around).

## Polish — small usability / visual items

All done 2026-08-31 except dark mode: branded 404/error pages, loading skeletons, OG link-preview cards (site-wide + per-submission, private submissions get a generic card), affiliation autocomplete on register/profile, whole-row click on the leaderboard, copy-link button + section anchors on results pages, relative timestamps in the admin activity feed, PNG export on every chart, glossary tooltips on test-run stats and compare rows. (Skip-link, focus-visible styling and the submissions empty state already existed.)

- **Dark mode** — brand tokens for it exist; charts and PDFs would stay light. Only worth doing if people ask.
