# Information-security compliance notes

How this platform maps to McMaster's **Information Security Policy (IS-00, 2016)** and what remains for the lab to decide. Intended as the starting point for the §26(b) risk assessment and for discussion with RHPCS / UTS IT Security (c-it-security@mcmaster.ca).

## What the policy requires of us

| Clause | Requirement | Status / action |
| --- | --- | --- |
| §3 Scope | Applies to any organisation handling University information — so Vercel/Render would be in scope as processors. | Their DPA/terms cover this; keep copies with the risk assessment. |
| §6, §32–33 Service owner | The department head accountable for the service is responsible for its security configuration and for reporting breaches. | Confirm the service owner (Dr. Kollmeyer / ECE chair) in writing before launch. |
| §18 Password Standard | Credentials must comply with the University Password Standard. | Site enforces ≥ 8 chars with mixed case + digit and bcrypt hashing; align the minimum length/complexity to the Password Standard once read (`src/lib/validation.ts` → `passwordSchema`). |
| §23 CASL | Bulk email must have an identified holder and an unsubscribe mechanism. | Only transactional mail (verification, reset, results) is sent today. If contest announcements are ever emailed to all users, add an opt-in flag + unsubscribe link first. |
| §24, §27, §33 Incident reporting | Breaches of personal information → University Privacy Officer without delay; security incidents → UTS IT Security. | Add to the admin runbook; the contact form and admin inbox make user reports visible. |
| §25 Classification Matrix | Information must be handled per its classification. | Classify (see below) once the matrix is available on SharePoint; expected: user records = *Confidential*, leaderboard results = *Public*, uploaded model packages = *Confidential* (third-party IP). |
| §26(a) Prefer internal services | "Use internally managed services to handle information." | Hosting on an RHPCS-managed VM satisfies this outright. Cloud hosting needs the §26(b) assessment. |
| §26(b) Assess external services | Risk-assess sharing information with external services. | Template below. |
| §26(c) SOPs | Supplement the policy with operating procedures for sensitive information. | This document + README ops notes; add account-verification and takedown procedures. |
| §26(d) Educate users | Users must know their responsibilities. | Terms of use, privacy page, submission checkbox (own code, open data only). |
| §37 Research units managing IT | Assure compliance, identify data owners, report incidents. | Data owner = the lab; users own their submitted code; results are the lab's. |
| Related legislation | FIPPA (public-body privacy), PIPEDA. | Collect the minimum (name, email, affiliation); privacy page states purpose and retention. |

## Data inventory

| Data | Examples | Sensitivity | Where it lives | Retention |
| --- | --- | --- | --- | --- |
| Account records | name, email, affiliation, bcrypt hash, role | Personal information (Confidential) | PostgreSQL | until account deletion |
| Submission metadata + results | model name, description, scores, time series | Public (unless flagged private) | PostgreSQL | indefinite (benchmark record) |
| Submission packages | `.zip` with `Model.m/.p`, parameters | Third-party IP (Confidential) | Local disk or a private Supabase Storage bucket | **deleted immediately after evaluation** |
| Evaluation logs | worker log lines | Internal | PostgreSQL | with the submission |
| Contact messages | name, email, free text | Personal information | PostgreSQL | until resolved/deleted |
| Blinded dataset | the hidden test cycles | **Restricted** (the whole benchmark depends on secrecy) | evaluator host only — never in the web tier or repo | permanent |

The last row is the most important classification: the blinded data must only ever exist on the machine that runs the evaluator, which favours running the worker on a campus machine.

## §26(b) risk assessment — cloud option (Vercel + Supabase)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Provider breach exposes user records | Low | Medium (names/emails; hashes are bcrypt) | Minimal PII; strong hashing; providers are SOC 2; encryption at rest; choose Canadian region for Postgres where offered |
| Model IP exposure from package storage | Low | Medium–High (competitors' code) | private bucket (no public URLs), uploads via short-lived signed URLs for signed-in users only, reads require the service key, objects deleted within minutes after evaluation, HTTPS only |
| Malicious submission code on the evaluation host (exfiltrate blinded data / secrets, persist, pivot) | Medium (code execution is inherent) | High | each evaluation runs in a throw-away Docker container: no network, read-only root, all capabilities dropped, no-new-privileges, CPU/memory/pid limits, unprivileged user, only the package (ro), blinded data (ro, real runs only) and an output directory mounted; host secrets never enter the container; zip-slip / zip-bomb checks on upload and extraction; worker runs as a dedicated low-privilege account outside synced folders (README → Security model) |
| Abuse of web endpoints (credential stuffing, registration/e-mail spam, queue flooding) | Medium | Medium | DB-backed rate limits on login / register / reset / contact / uploads, per-user daily submission cap, CSP + HSTS + frame/referrer/permissions headers |
| Data residency outside Canada | Certain for Vercel functions unless pinned; avoidable for DB | Policy/contract | Pin Vercel region; Render Postgres in Canada; or host DB on campus |
| Loss of availability (provider outage) | Low | Low (research service) | Daily DB backups; repo + `render.yaml` allow rebuild in hours |
| Blinded data leakage | N/A for cloud tier | Critical | Blinded data never leaves the evaluator host |

## Single-campus-VM option (RHPCS)

Satisfies §26(a) directly. Requirements: Ubuntu/Debian VM, Node 20+, PostgreSQL 16, outbound SMTP, HTTPS certificate for `batterysocbenchmark.ca`, 2 vCPU / 4 GB is ample; `STORAGE=local`; worker runs on the same VM or on a MATLAB-licensed lab PC. Backups per RHPCS backup service. Public reachability (not VPN-only) must be requested since external institutions need to submit.

## Open items

1. Read the Information Classification Matrix and Password Standard (MacID SharePoint); adjust `passwordSchema` if stricter.
2. Decide hosting option with Dr. Kollmeyer; file the §26(b) assessment with IT Security if cloud is chosen.
3. Name the service owner and an operational contact in the site footer/contact page.
4. Write the breach-response runbook (who calls the Privacy Officer, how accounts are locked, how submissions are purged).

### Update 2026-08-26 — evaluation sandbox and abuse controls

Per-evaluation Docker isolation, allow-listed host environment, zip-slip/zip-bomb rejection, DB-backed rate limits, per-user submission caps and browser security headers are now implemented (risk table above updated). Outstanding human steps and open items are tracked in `security.md`; the largest residual risk is MATLAB packages running outside the container until the MATLAB sandbox image is built on the DRAC VM.
