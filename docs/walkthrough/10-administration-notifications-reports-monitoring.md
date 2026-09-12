## 10. Administration, notifications, reports, monitoring

> **Plain English.** Administrators can moderate submissions, manage users and contests, tune the evaluation limits, change the scoring weights, and watch the worker machines. Every admin action is recorded in an activity feed on the site; e-mail is only a copy of that feed, and each admin chooses which kinds of e-mail they want. A robot checks every ten minutes that a worker is alive and e-mails the admins once if it isn't, and once when it comes back.

### The admin area

```mermaid
flowchart TB
    O["<b>Overview</b><br/>counts · latest submissions · activity feed"]
    S["<b>Submissions</b><br/>moderate · bulk delete · retry"]
    C["<b>Contests</b><br/>create · open · close"]
    U["<b>Users</b><br/>verify · roles · delete"]
    M["<b>Messages</b><br/>the feedback inbox"]
    W["<b>Evaluation workers</b><br/>machines · queue · settings"]
    G["<b>Scoring weights</b><br/>preview · save · rescore"]
    N["<b>My notifications</b><br/>per-admin e-mail toggles"]
    O ~~~ S ~~~ C ~~~ U
    M ~~~ W ~~~ G ~~~ N
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class O,S,C,U,M,W,G,N web
```

### The admin actions and their safety rails

All in [admin/actions.ts](../../src/app/(admin)/admin/actions.ts); every one begins with `requireAdmin()`.

| Action | Rails |
|---|---|
| Moderate a submission (private / public / hide / unhide / delete) | reason ≥ 10 characters; delete blocked while RUNNING; private/public blocked for contest entries ("hide it instead") |
| Bulk delete | up to 100 ids; RUNNING ones skipped; one activity line; authors optionally e-mailed |
| Delete a user | no self-delete; **cannot delete an admin — revoke admin first** (one compromised admin cannot wipe the others); blocked if any of their submissions is RUNNING; storage objects removed, database rows cascade |
| Change a role | cannot change your own |
| Worker commands (pause / resume / stop) | written to `WorkerHeartbeat.command`, picked up at the next heartbeat (≤ 15 s); *forget* offered only for offline rows |
| Release a job's lock | behind a confirm — a live worker would then double-evaluate |
| Evaluation settings | timeout 10–1440 min, dry-run 2–60 min, per-day 1–100 |
| Scoring weights | preview first; must sum to 1; identical-to-active rejected |
| Contests | only one OPEN at a time |

### Notifications: who gets told, and how

```mermaid
flowchart TB
    EV["something happens<br/>registration · deletion · role change · feedback · worker outage"]
    AF["<b>recordAdminEvent</b> → AdminEvent row<br/>always, regardless of any toggle<br/>(Admin → Overview activity feed)"]
    T{"ADMIN_NOTIFY_EMAIL<br/>env set?"}
    FIX["that fixed list, toggles ignored"]
    TOG["every ADMIN whose toggle<br/>for this kind is not off"]
    SEND["<b>one e-mail per recipient</b><br/>never CC"]
    AFTER["inside after() from next/server<br/>so the page returns instantly and<br/>Vercel keeps the function alive"]
    EV --> AF
    EV --> T
    T -- yes --> FIX
    T -- no --> TOG
    FIX --> SEND
    TOG --> SEND
    SEND --> AFTER
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class EV,T,TOG,FIX web
    class AF data
    class SEND ext
    class AFTER danger
```

Five kinds each admin toggles for themselves on *My notifications*: feedback, accounts, roles, deletions, workers. **Never CC** because a CC leaks addresses to everyone on the thread and cannot respect per-person toggles. **`after()`** because Vercel freezes a serverless function the instant it returns its response — an un-awaited promise is silently dropped, which is exactly how a batch of admin notifications went missing before this was found. In code:

```ts
// the rule, everywhere a server action sends mail it does not wait for
import { after } from "next/server";
after(() => accountDeletedEmail(user, reason, adminName, counts, notifyUser).catch(() => {}));
```

All templates live in [mail.ts](../../src/lib/mail.ts): a maroon header, the McMaster and NSERC logo row and acknowledgement in the footer; the results e-mail embeds a confetti GIF as an inline attachment so it shows even where remote images are blocked. With no `SMTP_HOST` configured, mail goes to a throw-away Ethereal inbox and the preview link is printed — how development works.

### The PDF report

Built by [report.ts](../../src/lib/report.ts) with pdfkit — A4, entirely vector, no browser involved.

```mermaid
flowchart TB
    P1["<b>Page 1</b> — title block, author, dates, evaluator version<br/>four stat cards · error-by-test-case bars · error-vs-temperature bars"]
    P2["<b>All test cases</b> — 18-row table (test, name, data, weight, RMSE)<br/>+ score history when there is more than one revision"]
    P3["<b>How this score is computed</b> — eight short paragraphs<br/>+ this submission's weight × RMSE table summed to the score"]
    P4["<b>Time-domain results</b> — the illustrative cycle traces, two per row"]
    P5["<b>Robustness cases</b> — initial-SOC and sensor-offset traces"]
    P6["<b>Per-cycle errors</b> — every cycle: RMSE, MAE, max, duration"]
    FT["footer on every page: submission URL · citation · NSERC acknowledgement · page i / n"]
    P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> FT
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    class P1,P3 web
    class P2,P6 data
    class P4,P5 good
    class FT ext
```

### Outage monitoring

Born from the 1 September Arbutus routing outage: the worker was healthy but could not reach the database for ten hours, and nobody was told. The website is the one vantage point that always sees both the database and SMTP, so it does the watching.

```mermaid
sequenceDiagram
    participant GH as GitHub Action
    participant W as worker-health endpoint
    participant DB as Database
    participant A as Admins

    Note over GH: every 10 minutes
    GH->>W: GET with the token
    W->>DB: heartbeats · queue · last "ops" event
    W->>W: heartbeat in the last 3 min?<br/>stranded work?
    alt problem, and different from the last recorded state
        W->>DB: AdminEvent "Worker alert: …"
        W-->>A: one alert e-mail
    else problems cleared, and the last state was an alert
        W->>DB: AdminEvent "Workers recovered"
        W-->>A: one all-clear e-mail
    else no change
        W->>W: nothing
    end
    W-->>GH: 200 JSON
```

```mermaid
stateDiagram-v2
    [*] --> Healthy
    Healthy --> Alerted : problems appear, e-mail sent
    Alerted --> Alerted : same problems, silent
    Alerted --> Alerted : different problems, e-mail sent
    Alerted --> Healthy : problems clear, all-clear sent
```

Three minutes = twelve missed 15-second heartbeats — long enough that the routine 10-minute update restart never trips it. Counts (how many queued) go into the details, never into the problem text, so a growing queue cannot read as a new outage. A **red** Action run means the *website* was unreachable — GitHub reports that separately. The Workers admin page uses a stricter 60 s window for its "online" badge; the two thresholds are deliberately different (display versus alerting).

**Files to open, in order:** [admin/actions.ts](../../src/app/(admin)/admin/actions.ts) → [admin-notify.ts](../../src/lib/admin-notify.ts) → [mail.ts](../../src/lib/mail.ts) → [report.ts](../../src/lib/report.ts) → [api/ops/worker-health/route.ts](../../src/app/api/ops/worker-health/route.ts) → [.github/workflows/worker-health.yml](../../.github/workflows/worker-health.yml).

