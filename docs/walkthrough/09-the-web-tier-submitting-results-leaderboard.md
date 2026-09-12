## 9. The web tier: submitting, results, leaderboard

> **Plain English.** The submit page lets you test a package for free before spending one of your three daily submissions. The results page explains the score in plain language first, then shows the numbers, then the charts. The leaderboard ranks public models; your private ones show a "ghost" rank so you can see where you would stand without displacing anyone.

### There is no REST API

Pages read the database directly in Server Components and return finished HTML. Forms call Server Actions. This is the pattern that surprises people coming from an API-first codebase:

```mermaid
flowchart LR
    subgraph READ["Reading a page"]
        direction TB
        R1["Browser requests /leaderboard"] --> R2["Server Component<br/>queries via Prisma"] --> R3["finished HTML"]
    end
    subgraph WRITE["Submitting a form"]
        direction TB
        W1["Browser invokes a Server Action"] --> W2["validate (zod), check session,<br/>rate limit, write via Prisma"] --> W3["result; affected pages re-rendered"]
    end
    style READ fill:#F2E6EC,stroke:#7A003C
    style WRITE fill:#F2E6EC,stroke:#7A003C
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class R1,W1 person
    class R2,W2 web
    class R3,W3 good
```

Route handlers under `src/app/api/` exist only for the handful of things that genuinely need a URL: status polling, the PDF and JSON downloads, upload URLs, avatars, the health check.

### The submit page

```mermaid
flowchart TB
    A["choose a .zip"] --> B{"Test first?"}
    B -- "dry run (free, 5/hour)" --> C["upload → startDryRunAction<br/>poll /api/dry-runs/id every 2 s"]
    C --> D["RMSE · MAE · max · complexity<br/>console · SOC trace"]
    D --> E["'Use this package for the submission'"]
    B -- submit --> F["form: name, description, type,<br/>private?, contest?, collaborators, terms"]
    E --> F
    F --> G["upload with progress bar (Supabase)<br/>then 'checking the package structure'"]
    G --> H["createSubmissionAction (Part 4, step 2)"]
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class A,B,E person
    class C,F,G,H web
    class D good
```

The form is fully controlled — React 19 resets uncontrolled inputs after an action — and validates with the *same* zod schema the server uses, so a rejection is caught before the upload. Picking a contest force-clears *private*: contest entries must stay public for the frozen contest leaderboard.

### The results page, top to bottom

```mermaid
flowchart TB
    H["<b>Header</b> — name, status, weighted error, rank, #seq · vN, author avatars"]
    T["<b>Transient</b> — StatusPoller while queued/running · confetti for the owner within 14 days · failure alert with the log"]
    I["<b>ResultInsights</b> — rule-based plain-English bullets:<br/>what drove the score, over-fit check (blinded vs non-blinded ratio),<br/>cold-temperature ratio, robustness verdicts"]
    S["<b>Scorecard</b> — 18 rows: RMSE, weight, weight × RMSE, Σ<br/>(warns if Σ differs from the stored score by > 0.002)"]
    K["<b>Key cases</b> — grouped traces: drive cycles · wrong initial SOC · sensor offset<br/>+ the RMSE-vs-offset chart"]
    F["<b>Folds</b> — test-case bar charts · all 144 cycles with a trace picker · score history with deltas"]
    D["<b>Downloads</b> — PDF · JSON · traces .mat"]
    A["<b>About</b> and <b>Collaborators</b>"]
    H --> T --> I --> S --> K --> F --> D --> A
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class H,T,A web
    class I,S,K good
    class F,D data
```

The order is deliberate: *why* before *what* before *detail*. A researcher who reads only the insights and the scorecard knows what to fix. Access is decided by `canViewSubmission`: admin, owner, collaborator, or public-and-not-hidden. The **Manage** menu (owner or admin) offers: edit name/description/type (name and type freeze once a contest closes); submit a new version (same submission, `version + 1`, previous score kept in history); make private/public (hidden for contest entries); re-run when FAILED; cancel while queued/running; delete.

### Live status while waiting

```mermaid
flowchart TB
    A["StatusPoller mounts"] --> B["fetch /api/submissions/id/status after 1 s"]
    B --> C["then every 2.5 s"]
    C --> D{"response"}
    D -- "QUEUED / RUNNING" --> E["parse progress % · stage · ETA<br/>from the log with progressFromLog<br/>(the same function the server uses)"]
    E --> C
    D -- "COMPLETED / FAILED" --> F["refresh, then reload the page"]
    D -- "404" --> G["redirect to /submissions?cancelled=1"]
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class A,B,C,D,E web
    class F good
    class G danger
```

The progress line format is `NN.N% | cycle:m80:3`; the regex, the "validation stage pinned to 1 %" rule and the ETA formula all live in one file, [progress.ts](../../src/lib/progress.ts), so the page and the queue estimator can never disagree. *The ETA formula:* if reaching 40 % took 8 minutes, the remaining 60 % is estimated at 8 × 60 / 40 = 12 minutes, minus however long since the last progress line, floored at 30 s.

### The leaderboard: which rows, and how they are ranked

```mermaid
flowchart TB
    Q["getLeaderboardRows"] --> A["has a result<br/>AND status COMPLETED / QUEUED / RUNNING<br/>(a model being re-evaluated keeps its old score)"]
    A --> B["not hidden — unless the viewer is an admin"]
    B --> C["public — OR owned by the viewer"]
    C --> D["collaborators shown only if accepted"]
    D --> R["rows"]
    R --> F["client: filters (author, affiliation, type);<br/>current-benchmark rows only"]
    F --> G["<b>public</b> rows ordered by weighted error,<br/>then all-cells RMSE, then earlier submission → ranks 1…n"]
    F --> H["viewer's <b>private</b> rows → ghost rank ~N<br/>= public rows better than mine + 1<br/>(shown without displacing anyone)"]
    F --> I["<b>legacy</b> rows → unranked, sorted below"]
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    class Q,A,B,C,D,R data
    class F web
    class G good
    class H person
    class I ext
```

**A worked ranking.** Five models, and you are signed in as the owner of the private one:

| Model | Weighted error | All-cells | Submitted | Public? | Shown as |
|---|---|---|---|---|---|
| A | 2.10 | 2.4 | Mar 3 | yes | **1** |
| B | 2.35 | 2.8 | Mar 9 | yes | **2** — tie on weighted error… |
| C | 2.35 | 2.6 | Apr 1 | yes | **2** …no: C's all-cells is lower, so C is 2 and B is 3 |
| D | 3.00 | 3.1 | Feb 1 | yes | **4** |
| Mine | 2.50 | 2.7 | Apr 5 | private | **~4** — three public rows are better; nobody moves |

The tie-break is applied identically on the client (`rankById`) and on the server (`publicRankOf`, which produces the rank badge on a results page), so the two can never disagree. Column visibility persists in `localStorage`; CSV export renders rank as `N`, `~N (private)` or `unranked (legacy scoring)`.

### Scoring on the web side, and changing the grading

`weightedError()` in [scoring.ts](../../src/lib/scoring.ts) is Σ(w·v)/Σw over the 18 cases defined in [test-cases.ts](../../src/lib/test-cases.ts). Administrators can override the weights:

```mermaid
flowchart TB
    A["Admin → Scoring weights"] --> B["edit 18 weights<br/>(must sum to 1 ± 0.001)"]
    B --> C["<b>Preview</b>: how many stored scores change"]
    C --> D["Save with a reason"]
    D --> E["new ScoringConfig row (append-only)"]
    E --> F["every stored result re-scored<br/>from its 18 stored metrics"]
    F --> G["ScoreRevision 'rescore' per submission"]
    G --> H["optional e-mail to each author<br/>with old → new score and a fresh PDF"]
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    class A,B,D person
    class C web
    class E,F,G data
    class H ext
```

Everything that shows or computes a score — page, PDF, JSON, worker — reads `getActiveWeights()` (30 s cache), so they can never disagree.

**Benchmark versioning** is the other kind of change. Results are stamped `socbench-eval-0.1.0/<runtime>`. If the evaluator's *maths* changes, bump `__version__` and `BENCHMARK_VERSION`; older results become "legacy · unranked" and authors are e-mailed to resubmit. They cannot be re-run automatically because packages are deleted after evaluation on purpose — that is the price of not retaining third-party IP.

### Collaborators

```mermaid
stateDiagram-v2
    [*] --> Pending : owner adds a verified account
    Pending --> Invited : owner presses Send invitations, e-mail with Accept and Decline links, owner CC'd
    Invited --> Accepted : invitee accepts, shown publicly
    Invited --> [*] : invitee declines
    Pending --> [*] : owner removes
    Accepted --> [*] : leaves or is removed
```

Links land on `/collab/[token]`; decisions are POSTs, never GETs, so scanners cannot answer on someone's behalf; only the invited account can respond even though the owner holds the same link. Results e-mails go to the owner and every *confirmed* collaborator.

### Contests

```mermaid
stateDiagram-v2
    [*] --> DRAFT : admin creates
    DRAFT --> OPEN : admin opens, any other OPEN contest is closed
    OPEN --> CLOSED : end date passes or admin closes
    CLOSED --> JUDGED : admin marks judged
```

While OPEN and within its dates: register (`ContestEntry`), then submit; up to `maxSubmissionsPerUser` non-failed entries; entries must stay public. `/contest/[slug]` freezes its leaderboard by showing only submissions with `submittedAt <= endsAt`. Once closed, resubmission is blocked and name/type are frozen.

### Compare

`/compare?ids=a,b,c,d` — at most 4, filtered to rows the viewer may see: a metric table with the best value per row highlighted, the same bar charts as the results page, and overlaid SOC traces when all selected models have them.

**Files to open, in order:** [submit-form.tsx](../../src/app/(app)/submit/submit-form.tsx) → [submissions/[id]/page.tsx](../../src/app/(app)/submissions/[id]/page.tsx) → [status-poller.tsx](../../src/app/(app)/submissions/[id]/status-poller.tsx) → [progress.ts](../../src/lib/progress.ts) → [queries.ts](../../src/lib/queries.ts) → [leaderboard-table.tsx](../../src/components/leaderboard/leaderboard-table.tsx) → [scoring-config.ts](../../src/lib/scoring-config.ts).

