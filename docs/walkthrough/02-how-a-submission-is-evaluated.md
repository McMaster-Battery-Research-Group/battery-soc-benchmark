<a id="part-2"></a>
## 2. How a submission is evaluated

> **Plain English.** A researcher uploads a zip. The website checks it and puts a ticket in a queue. A worker takes the ticket, downloads the zip, runs the model inside a sealed box against the secret data, saves the scores, deletes the zip, and e-mails a PDF. If anything goes wrong, the researcher is told exactly what.

Part 1 introduced the three programs. This part follows one submission through all three, in order; the numbered steps after the diagram explain each arrow.

### The journey

Time runs downward. Solid arrows are actions; dashed arrows are things coming back.

```mermaid
sequenceDiagram
    participant R as Researcher
    participant W as Website
    participant K as Worker
    participant S as Sandbox
    R->>W: upload, submit
    W->>W: check zip, queue
    K->>W: claim job
    K->>S: run model
    S-->>K: scores
    K->>W: store, delete zip
    K-->>R: e-mail PDF
```

### Step by step

**1. Upload.** The browser sends the zip straight to the file bucket using a short-lived signed link, because the website's host only accepts requests under 4.5 MB and packages can be 50 MB. The form then carries only the file's key.

**2. Check.** One server action does everything, cheapest check first: signed in? under the daily cap of 3? name and description valid? Then it fetches the zip back and inspects it — size and entry limits, no folders, no path tricks, exactly one `Model.py` or `Model.m`/`Model.p` at the top level. Any failure deletes the upload and shows the exact reason. Passing creates the `Submission` and its `EvaluationJob` (the queue ticket) in one insert, and records whether it is a Python or MATLAB package.

**3. Wait.** The submission page polls every 2.5 s and shows the queue position, an estimated start time, and whether a worker for this package's language is online. All of it is derived from two tables: the workers' heartbeats and the job queue.

**4. Claim.** Workers poll every 2 s. Taking a job is a single conditional update — lock this row *only if it is still unlocked* — so two workers can never take the same job. The diagram is one attempt; the two branches are the only outcomes:

```mermaid
flowchart TB
    A["Oldest unclaimed job for my language"] --> B["UPDATE … WHERE lockedAt is still what I read"]
    B -- "1 row changed" --> C["Mine — run it"]
    B -- "0 rows changed" --> D["Another worker got it — look again"]
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class A,B data
    class C good
    class D danger
```

Every progress line the model prints refreshes the lock, so a live job is never mistaken for a dead one; a job whose worker died becomes claimable again after 30 quiet minutes, with two attempts in total.

**5. Run.** The worker starts one Docker container with three mounts and nothing else: the package (read-only), the hidden data (read-only), and an output folder. Everything the container prints streams into the job log, which is what the website shows as the live console. A timer (default 6 h) and the owner's Cancel button both kill the container and any MATLAB inside it. What the container is *not* allowed to do is the subject of Part 5. Two things go in, one thing comes out:

```mermaid
flowchart TB
    P["package.zip, read-only"] --> C
    H["blind_data.mat, read-only"] --> C["Container<br/>no network · read-only files · no privileges"]
    C --> O["results.json and traces.mat"]
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class P worker
    class H danger
    class C sandbox
    class O data
```

**6. Store.** The worker checks that all 18 metrics are finite numbers, re-derives the headline score with the active weights as a cross-check, writes the result and marks the submission complete in one transaction, uploads the full-resolution traces file, appends a line to the submission's score history, and **deletes the package**. Only then does it build the PDF and e-mail the owner and any confirmed co-authors.

**7. The other endings.** Every state a submission can be in, and what moves it between them:

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Running : claimed
    Running --> Completed : scored
    Running --> Failed : the model broke
    Running --> Queued : our fault, retry once
    Queued --> Cancelled : owner cancels
    Running --> Cancelled : owner cancels
    Failed --> Queued : owner re-runs
    Completed --> Queued : owner submits a new version
```

A failure caused by the package (it crashed, returned NaN, ran out of time) is final and the message is stored verbatim; a failure caused by us (Docker down, a bug) is retried once. Stopping the worker hands its job back to the queue without using up an attempt.

**Files to open:** [submit/actions.ts](../../src/app/(app)/submit/actions.ts) → [package-check.ts](../../src/lib/package-check.ts) → [run-job.ts](../../src/evaluator/run-job.ts) → [python-evaluator.ts](../../src/evaluator/python-evaluator.ts).

