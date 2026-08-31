# Roadmap — open improvements

Kept current so "what's pending?" has one answer. Last updated 2026-08-31 (after tracker items 1–14 were resolved). Detailed security items live in `security.md`; tracker resolutions in `issue-tracker-2026-08-28.csv`.

## Launch blockers

1. **Domain + Resend for e-mail** — Gmail app-password sending is capped (~500/day), lands in spam at McMaster, and is tied to a personal account. Needs the `batterysocbenchmark.ca` decision (human), then DNS + API key (~1 h). Step list in README → TODO.
2. **Rotate Supabase DB password + service-role key**, then remove `.env.production` and `blind-data/` from the laptop/OneDrive — the VM is the only host that needs them now. (Human: Supabase → Settings; then update `/etc/socbench/worker.env`.)
3. **Delete demo data** — `example.edu` accounts, seeded rows, and the ~20 private "Arbutus smoke/parity/timing/traces" test submissions (bulk delete on Admin → Submissions makes this quick); trim `prisma/seed.ts`.
4. **Official McMaster + NSERC logos** — waiting on the Brand Marketing request (tracker #4, PJK).

## Security (see security.md for the full list)

5. **Weekly DB backup** — Supabase free tier has no backups; a scheduled `pg_dump` (GitHub Action → private bucket) is the cheapest insurance. Top security priority.
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

## Polish — small usability / visual items (roughly ordered by value ÷ effort)

- **Branded 404 and error pages** — today a crash or bad URL shows Next.js defaults; a maroon "this cycle went off-road" page with links home is an hour of work.
- **Loading skeletons** (`loading.tsx` per route) — leaderboard and results pages query the DB on every view; a skeleton beats a white flash, especially from campus Wi-Fi.
- **Social/OG cards** — `og:image` per page (site card; per-submission card with model name + score) so links pasted into Teams/Twitter/LinkedIn unfurl properly. Matters for launch announcements.
- **Affiliation autocomplete** on register/profile, suggesting existing affiliations — prevents "McMaster University" vs "McMaster Univ." splitting the leaderboard filter.
- **Whole-row click targets** on the leaderboard (row → submission page), with the current links kept for middle-click.
- **Copy-link button** on results pages (and section anchors for the folds, e.g. `#score-history`) so people can share exactly what they mean.
- **Relative timestamps** ("3 min ago") with the absolute time in a tooltip, used consistently on admin pages and status cards.
- **Export chart as PNG** button on the SOC-trace and comparison charts — people screenshot them for slides today.
- **Glossary coverage pass** — the dotted-underline `<Term>` tooltips exist but are used sparsely; wire them through the leaderboard headers and results page.
- **Focus/keyboard pass** — visible focus rings on the custom controls (navigator handles, zoom toolbar, checkboxes), skip-to-content link. Cheap and it matters for AODA.
- **Empty states with next actions** — e.g. an empty My submissions shows "Test a package first →" instead of a bare table.
- **Dark mode** — brand tokens for it exist; the charts and PDFs stay light. Biggest item on this list; only worth it if people ask.
