## 2. The five-minute version

> **Plain English.** Researchers upload a small program that guesses how full a battery is. We run that program against battery data that has never been published, score it with a fixed public formula, and put the score on a public leaderboard. Everyone is scored on the same hidden data with the same code, so for the first time the numbers are comparable. The uploaded program is deleted the moment it has been scored, and it never touches the website.

### The problem it solves

```mermaid
flowchart TB
    P1["Paper A<br/>'1.8 % RMSE' — on its own data"]
    P2["Paper B<br/>'2.1 % RMSE' — different cells and cycles"]
    P3["Paper C<br/>'1.5 % RMSE' — room temperature only"]
    Q["Which is actually better?<br/>Nobody can tell."]
    B["<b>The benchmark</b><br/>same hidden data, same scoring code, every model"]
    L["One leaderboard where the numbers<br/>mean the same thing"]
    P1 --> Q
    P2 --> Q
    P3 --> Q
    Q --> B --> L
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class P1,P2,P3 ext
    class Q danger
    class B,L web
```

### A researcher's experience, start to finish

```mermaid
flowchart TB
    A["Register and confirm e-mail"] --> B["Download a reference package<br/>and adapt it to their own estimator"]
    B --> C["<b>Dry run</b> on open data — 12 seconds, free"]
    C --> D{"passed?"}
    D -- "no: it caught a format error" --> B
    D -- yes --> E["Upload and <b>submit</b><br/>(one of 3 per day)"]
    E --> F["Watch the live progress bar"]
    F --> G["Read the plain-English insights<br/>and the scorecard"]
    G --> H["Open the PDF from the e-mail;<br/>compare against the top three"]
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class A,B,E,F person
    class C,D web
    class G,H good
```

### The three tiers, and what each may touch

Everything in the system is one of three kinds of program. The most important fact about the design is *what each is allowed to reach*.

```mermaid
flowchart TB
    subgraph WEB["Website — Vercel, in the cloud"]
        W["Pages, forms, leaderboard, admin<br/>Reads and writes database rows<br/><b>Never runs submitted code<br/>Never sees the blinded data</b>"]
    end
    subgraph WORKER["Worker — the lab's cloud VM"]
        K["Watches the database for queued jobs<br/>Downloads the package<br/><b>Holds the blinded data</b><br/>Starts one sandbox per evaluation"]
    end
    subgraph SANDBOX["Sandbox — a throw-away Docker container"]
        S["Runs the submitted model<br/>No network · read-only files · no secrets<br/>Destroyed afterwards"]
    end
    DB[("PostgreSQL + file bucket<br/>Supabase")]
    W <--> DB
    K <--> DB
    K --> S
    style WEB fill:#F2E6EC,stroke:#7A003C
    style WORKER fill:#FFF3D6,stroke:#B8860B
    style SANDBOX fill:#E6F2EC,stroke:#0E5B3D
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class W web
    class K worker
    class S sandbox
    class DB data
```

The website and the worker share **nothing but the database**. They never talk to each other. That one fact explains a great deal of what follows: why adding a second worker machine needs zero configuration (it simply starts claiming jobs), why the website stayed up during a ten-hour network outage that cut the worker off, and why the queue is a database table rather than a queue service.

### What could go wrong, and what stops it

| Worry | What stops it |
|---|---|
| A malicious model steals the blinded data | It can read it (it must, to be scored) but cannot send it anywhere: no network, and the container is destroyed afterwards |
| A malicious model attacks the website or database | It cannot reach them — they are on different machines, and the sandbox has no network |
| A model runs forever | Hard timeout (360 min), enforced both inside and outside the container |
| A researcher's code is kept and misused | The package is deleted the moment it is scored; only scores and traces remain |
| Someone floods the queue | 3 submissions per person per day; uploads and dry runs rate-limited |
| Two workers evaluate the same model | Atomic claim (Part 4) |
| A worker crashes mid-run | Lock goes stale after 30 min; another worker picks the job up; two attempts per job |
| The worker loses its network | It retries every 2 s and resumes by itself; admins are e-mailed after 3 minutes of silence |
| Someone guesses passwords | bcrypt hashing plus 10 attempts per 15 min per account |

### Where each thing physically is

| What | Where | Why there |
|---|---|---|
| Website | Vercel, free tier | Zero-ops hosting for Next.js; scales itself |
| Database + file bucket | Supabase, free tier | PostgreSQL and object storage in one account |
| Worker | Arbutus VM, Ubuntu 24.04, 8 vCPU / 12 GB | The lab controls it; MATLAB can be licensed there; the only place the blinded data exists |
| MATLAB | Inside a Docker image on that VM | So MATLAB models run in the same kind of sandbox as Python ones |
| Source code | GitHub, `McMaster-Battery-Research-Group` organization | Read-only collaborators can read and propose; only the owner merges |
| E-mail | Gmail SMTP today; Resend once a domain exists | Configuration only — the code is provider-agnostic |

**Files to open, in order:** [README.md](../../README.md) → [prisma/schema.prisma](../../prisma/schema.prisma) → [src/evaluator/worker.ts](../../src/evaluator/worker.ts).

