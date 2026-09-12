## 4. 📦 Life of a submission, end to end

> 💡 **Plain English.** A researcher uploads a zip. The website checks that it is well-formed and puts a ticket in a queue. A worker machine takes the ticket, downloads the zip, runs the model inside a sealed box against the secret data, saves the scores, deletes the zip, and e-mails a PDF. If anything goes wrong the researcher is told exactly what. Follow this part once with the files open and you can answer almost any question about the system.

### 🗺️ The whole journey in one picture

First half — on the website:

```mermaid
sequenceDiagram
    participant R as 👤 Browser
    participant W as 🌐 Website
    participant DB as 🗄️ Storage

    rect rgb(242,230,236)
    R->>DB: 1 upload zip to the bucket
    R->>W: 2 submit form with the file key
    W->>W: validate metadata + zip
    W->>DB: Submission + job (QUEUED)
    Note over R,W: 3 page polls every 2.5 s
    end
```

Second half — on the worker:

```mermaid
sequenceDiagram
    participant DB as 🗄️ Storage
    participant K as ⚙️ Worker
    participant S as 🐳 Sandbox

    rect rgb(255,243,214)
    K->>DB: 4 claim oldest job (atomic)
    K->>DB: download package
    K->>S: 5 run vs blinded data
    S-->>K: progress lines
    S-->>K: results.json + traces.mat
    K->>DB: 6 store result, delete package
    Note over K: 7 e-mail with PDF to the researcher
    end
```

### 👤 What the researcher sees at each step

| Step | On screen | Behind it |
|---|---|---|
| Upload | A progress bar to 100 %, then "checking the package structure" | Direct PUT to the bucket; then the server re-downloads and validates |
| Queued | "Position 2 in the queue · about 25 min · evaluator online" | Heartbeat table + job table + the ETA simulation |
| Running | A live console, a percentage, a stage name, an ETA | Every line the sandbox prints, streamed into the job log |
| Done | Confetti, the plain-English insights, the scorecard, an e-mail with a PDF | One database transaction, then package deletion, then mail |
| Failed | The exact error, with the model's own traceback lines | `EvaluationError` marked user-facing — never retried |

### ⏱️ An evaluation on a clock

Rough proportions for a mid-weight model (a heavy LSTM in MATLAB can take 45 minutes; a Coulomb counter in Python takes 10 seconds):

```mermaid
%%{init: {"gantt": {"fontSize": 15, "sectionFontSize": 15, "barHeight": 28, "barGap": 6, "leftPadding": 110}}}%%
gantt
    title One evaluation, roughly to scale
    dateFormat HH:mm:ss
    axisFormat %M:%S
    section Set-up
    unzip + import the model        :a1, 00:00:00, 5s
    validation cycle (fail fast)    :a2, after a1, 20s
    section Model runs
    144 blinded drive cycles        :b1, after a2, 6m
    charging cycles                 :b2, after b1, 30s
    9 wrong-initial-SOC runs        :b3, after b2, 40s
    18 sensor-offset runs           :b4, after b3, 60s
    section Wrap-up
    scoring + traces.mat            :c1, after b4, 10s
    store, PDF, e-mail (worker)     :c2, after c1, 15s
```

### 📤 Step 1 — Upload: browser → bucket, bypassing the website

Vercel caps the body of a serverless request at 4.5 MB; packages can be 50 MB. So the file never passes through our server on the way in.

```mermaid
flowchart TB
    A["Browser picks a .zip"] --> B["POST /api/upload<br/>{name, size, purpose}"]
    B --> C{"Signed in?<br/>under 30 uploads/hour?<br/>.zip and under 50 MB?"}
    C -- no --> X["401 / 429 / 400"]
    C -- yes --> D["Website asks Supabase for a<br/><b>signed upload URL</b><br/>valid ~2 h, one object key"]
    D --> E["Browser PUTs the file<br/>directly to the bucket<br/>with a progress bar"]
    E --> F["The form now holds the<br/>object key, not the file"]
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class A,E,F person
    class B,C,D web
    class X danger
```

Files: [api/upload/route.ts](../../src/app/api/upload/route.ts), `uploadPackage()` in [upload-client.ts](../../src/lib/upload-client.ts), `createSignedUpload()` in [storage.ts](../../src/lib/storage.ts). Keys look like `submissions/1724600000000-ab12cd.zip`; the website accepts only keys matching `OBJECT_KEY_RE`, so a tampered form cannot point at some other object. In local development (`STORAGE=local`) the file simply travels inside the form.

### ✅ Step 2 — Validate and create

Everything below happens inside one server action, `createSubmissionAction` in [submit/actions.ts](../../src/app/(app)/submit/actions.ts), in this order. Cheap checks come first, and the pre-uploaded object is deleted on any rejection so the bucket never fills with rejects.

```mermaid
flowchart TB
    A["signed in?"] --> B["daily cap: fewer than 3 in the last 24 h<br/>(admins exempt; dry runs do not count)"]
    B --> C["zod: name 3–50, description 20–1000,<br/>model type, terms accepted"]
    C --> D["fetch the bytes back from the bucket"]
    D --> E[".zip extension · under 50 MB"]
    E --> F["<b>checkSubmissionPackage</b><br/>zip hygiene + exactly one Model file"]
    F --> G["collaborators: up to 10 verified accounts,<br/>never the owner"]
    G --> H["contest: OPEN, within dates,<br/>registered, under the entry cap"]
    H --> I["one INSERT:<br/>Submission + its EvaluationJob (the queue ticket)<br/>+ pending collaborators"]
    I --> J["redirect to the submission page"]
    F -- problem --> X["delete the uploaded object;<br/>show the exact reason"]
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class A,B,C,E,F,G,H web
    class D,I data
    class X danger
```

**Zip hygiene** ([package-check.ts](../../src/lib/package-check.ts)) is mirrored line for line by `safe_extract` in the Python evaluator, so a package that passes the website cannot surprise the worker:

| Check | Limit | Why |
|---|---|---|
| Entry count | ≤ 500 | Bounded work |
| Uncompressed total | ≤ 512 MB | Disk |
| Single entry | ≤ 256 MB | Disk |
| Compression ratio | ≤ 200 : 1 | Zip bombs are ~1000 : 1 |
| Paths | no `/…`, no `C:`, no `..` | Path traversal |
| Symlinks | none (checked in the attribute bits) | Escaping the extraction folder |
| Sub-folders | none — zip the *files*, not the folder | The single most common user mistake |
| Model file | exactly one of `Model.m` / `Model.p` / `Model.py` at top level, with a regex check on the function signature | The contract |

The `runtime` column (`python` or `matlab`) is set here, from which model file was found, so the right kind of worker claims the job later.

### ⏳ Step 3 — Waiting: where the numbers on the status page come from

The page polls `/api/submissions/[id]/status` — first after 1 s, then every 2.5 s. Everything it shows derives from two tables:

```mermaid
flowchart TB
    HB[("WorkerHeartbeat<br/>one row per worker, refreshed every 15 s")]
    JOB[("EvaluationJob<br/>one row per submission")]
    ON["<b>online?</b><br/>an un-paused heartbeat in the last 60 s<br/>that declares this package's runtime"]
    POS["<b>queue position</b><br/>older unfinished jobs of the same runtime + 1"]
    ETA["<b>ETA</b><br/>remaining time of running jobs (from their live %)<br/>+ average duration of each queued job ahead<br/>spread over the available slots"]
    PAGE["status page"]
    HB --> ON
    JOB --> POS
    HB --> ETA
    JOB --> ETA
    ON --> PAGE
    POS --> PAGE
    ETA --> PAGE
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class HB,JOB data
    class ON,POS,ETA,PAGE web
```

The average duration comes from the last 10 completed runs of the same model type (`averageRunSec` in [worker-status.ts](../../src/lib/worker-status.ts)), falling back to 45 minutes. If no worker can run this runtime, the page says so plainly — "no evaluator for MATLAB packages is online" — rather than showing an ETA that will never arrive.

*Worked example:* two slots, one job running with 12 minutes left, two queued jobs ahead of yours averaging 20 minutes each. Slot A: 12 min → then queued job 1 (ends at 32). Slot B: queued job 2 (ends at 20). Your job starts on the first free slot: **about 20 minutes**.

### 🔒 Step 4 — Claim: how two workers never take the same job

The worker ([worker.ts](../../src/evaluator/worker.ts)) polls every 2 s. Dry runs are claimed first — they are short and someone is watching. Then `claimJob()` in [run-job.ts](../../src/evaluator/run-job.ts):

```mermaid
flowchart TB
    A["SELECT the oldest EvaluationJob where<br/>attempts under 2<br/>AND (lockedAt is null OR lockedAt older than 30 min)<br/>AND submission is QUEUED or RUNNING<br/>AND runtime is one this worker declares"] --> B{"found one?"}
    B -- no --> Z["sleep 2 s, try again"]
    B -- yes --> C["UPDATE that row<br/>SET lockedAt = now, lockedBy = me, attempts + 1<br/><b>WHERE id = X AND lockedAt = the value I just read</b>"]
    C --> D{"rows updated?"}
    D -- "1" --> E["It is mine. Run it."]
    D -- "0" --> F["Another worker changed lockedAt<br/>a millisecond before me. Try again."]
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class A,C data
    class B,D,Z worker
    class E good
    class F danger
```

In code, the whole trick is one `WHERE` clause:

```ts
// run-job.ts — claimJob()
const candidate = await db.evaluationJob.findFirst({ where: { /* the SELECT above */ }, orderBy: { createdAt: "asc" } });
const { count } = await db.evaluationJob.updateMany({
  where: { id: candidate.id, lockedAt: candidate.lockedAt },   // only if nobody touched it since I looked
  data:  { lockedAt: new Date(), lockedBy: workerId(), attempts: { increment: 1 } },
});
return count === 1 ? candidate : null;                          // 0 means I lost the race — loop again
```

No transaction, no advisory lock, no queue service — a **compare-and-swap** on one column. If another worker won, the row no longer matches and the update touches zero rows.

**Why a 30-minute stale lock is safe for a 6-hour evaluation:** every progress line the evaluator prints is written to the job log, and *that write also refreshes `lockedAt`*. A live job is never stale. A job whose worker died stops being refreshed and becomes reclaimable after 30 quiet minutes.

### 🐳 Step 5 — Evaluate: the sandbox

`runJob` marks the submission RUNNING, downloads the package to a temporary file (`storage.materialize`), and hands off to `PythonEvaluator.spawn()` in [python-evaluator.ts](../../src/evaluator/python-evaluator.ts), which builds exactly one `docker run` command.

```mermaid
flowchart TB
    subgraph HOST["⚙️ Worker machine"]
        PKG["📦 package.zip<br/>→ /in/package.zip"]
        BD["🔐 blind_data.mat (mode 600)<br/>→ /data/blind_data.mat"]
        OUT["output folder (temp)<br/>→ /out"]
        subgraph C["🐳 Container socbench-id"]
            direction TB
            R1["--network none"] ~~~ R2["--read-only root filesystem"]
            R2 ~~~ R3["--cap-drop ALL<br/>--security-opt no-new-privileges"]
            R3 ~~~ R4["--memory 4g · --cpus 2<br/>--pids-limit 256"]
            R4 ~~~ R5["--user worker uid (Linux)"]
            R5 ~~~ R6["tmpfs /work 2 GB, /tmp 512 MB<br/>(RAM — vanishes with the container)"]
            R6 ~~~ EV["python -m socbench_eval<br/>/in/package.zip /out<br/>--data /data/blind_data.mat"]
        end
    end
    PKG -- "read-only" --> C
    BD -- "read-only" --> C
    OUT -- "read-write" --> C
    style HOST fill:#FFF3D6,stroke:#B8860B
    style C fill:#E6F2EC,stroke:#0E5B3D
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class PKG,OUT worker
    class BD danger
    class R1,R2,R3,R4,R5,R6,EV sandbox
```

Three mounts and nothing else. The container never sees the host's environment variables, so no database password, SMTP credential or storage key can leak. For MATLAB packages the image is `socbench-eval-matlab`, the network is `bridge` (only so MATLAB can check out its licence), a tmpfs `/home/matlab` is added because MATLAB insists on writing preferences at start-up, and a 24-hour licence token is passed in — never the year-long one. The full command is written to the job log with licence values **redacted**.

Every line the container prints is streamed into the job log by `input.log`. That log is what the website shows as the live console, and where the progress bar comes from.

**Two independent kill switches**, both calling `killTree` (a `docker kill` plus a process-group kill so a MATLAB child dies with its parent):

```mermaid
flowchart LR
    T["<b>Timer</b><br/>EvalSettings.evalTimeoutMin, default 360 min<br/>the same number is passed into the container<br/>so the inner limit matches"] --> K["killTree"]
    A["<b>AbortSignal</b><br/>the owner pressed Cancel<br/>cancelRequestedAt polled every 10 s<br/>and checked on every log line"] --> K
    K --> X["container gone · MATLAB gone · temp files removed"]
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class T worker
    class A person
    class K,X danger
```

**Host mode** (`EVAL_SANDBOX=none`, or a MATLAB package on a machine with no MATLAB image — this is how the laptop ran MATLAB natively during the outage): the same Python entry point, run directly, with an *allow-listed environment* — only `SOCBENCH_*`, `MATLAB_*`, `PATH` and locale variables reach it. Faster, not isolated. Dedicated low-privilege account only.

### 🏁 Step 6 — Score and store

Back in `runJob`, [results.ts](../../src/evaluator/results.ts) parses `results.json`: all 18 metric keys must be finite numbers. The website **re-derives** the weighted error from them with the *active* weights and logs a note if it disagrees with the evaluator by more than 0.01 (it never has, with default weights; when an admin has overridden the weights, the website's value wins).

```mermaid
flowchart TB
    RJ["results.json<br/>18 metrics · weightedError · complexity<br/>perCycle · timeSeries · robustness"] --> P["parseResultsJson<br/>+ re-derive weighted error"]
    TM["traces.mat  (~6 MB, full 1 Hz)"] --> BK[("bucket → tracesKey")]
    P --> TX["one transaction:<br/>EvaluationResult upsert<br/>Submission → COMPLETED<br/>EvaluationJob lock cleared"]
    TX --> H["ScoreRevision appended<br/>(evaluation / reevaluation)"]
    H --> DEL["<b>package deleted from the bucket</b>"]
    DEL --> PDF["PDF built (report.ts)"]
    PDF --> M["e-mail to the owner + every<br/>confirmed collaborator"]
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    class RJ,TM sandbox
    class P,PDF worker
    class BK,TX,H data
    class DEL danger
    class M ext
```

The large trace file goes to the bucket, not the database row, and replaces the previous one on a re-evaluation. The package is deleted *before* the e-mail step — nothing that happens afterwards can leave it behind.

### 🔁 Step 7 — The branches people forget

```mermaid
stateDiagram-v2
    [*] --> QUEUED : created
    QUEUED --> RUNNING : worker claims
    RUNNING --> COMPLETED : results stored
    RUNNING --> FAILED : user-facing error
    RUNNING --> QUEUED : internal error, retry
    RUNNING --> QUEUED : worker shutdown
    QUEUED --> [*] : cancelled before claim
    RUNNING --> [*] : cancelled while running
    FAILED --> QUEUED : Re-run
    COMPLETED --> QUEUED : new version
```

- **Retry happens only for our faults.** An `EvaluationError` marked `userFacing` — bad package, the model threw, timeout — is final; the exact message is stored and e-mailed. An internal error (Docker daemon down, a crash in our code) with `attempts < 2` unlocks the job and someone claims it again.
- **Cancel** while unclaimed → deleted outright. Once claimed → `cancelRequestedAt` is set; the worker notices within 10 s, aborts, and then either deletes the submission or — if this was a resubmitted v2+ — restores the previous version's score.
- **Worker shutdown** (Ctrl+C, `systemctl stop`, admin "stop"): in-flight evaluations are aborted with the reason `SHUTDOWN`; the job is handed back *with the attempt refunded* and the heartbeat row is deleted so the admin page does not show a ghost.

📌 **Files to open, in order:** [submit/actions.ts](../../src/app/(app)/submit/actions.ts) → [package-check.ts](../../src/lib/package-check.ts) → [worker.ts](../../src/evaluator/worker.ts) → [run-job.ts](../../src/evaluator/run-job.ts) → [python-evaluator.ts](../../src/evaluator/python-evaluator.ts) → [results.ts](../../src/evaluator/results.ts) → [worker-status.ts](../../src/lib/worker-status.ts).

