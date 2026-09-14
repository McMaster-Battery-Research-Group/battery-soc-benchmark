<a id="part-1"></a>
## 1. The five-minute version

> **Plain English.** Researchers upload a small program that guesses how full a battery is. We run it against battery data that has never been published, score it with a fixed public formula, and put the score on a public leaderboard. Everyone is scored on the same hidden data with the same code, so the numbers are comparable. The uploaded program is deleted the moment it is scored, and it never touches the website.

### The problem

Every battery paper reports its own accuracy on its own data, so nobody can tell whose method is actually better. The benchmark fixes the data and the test: same hidden cycles, same scoring code, every model. Read the diagram top to bottom — it is the whole idea in five steps:

```mermaid
flowchart TB
    A["Open dataset, published"] --> B["Researcher builds an SOC model"]
    B --> C["Uploads a .zip"]
    C --> D["Scored on hidden data"]
    D --> E["Public leaderboard and PDF report"]
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class A data
    class B,C person
    class D danger
    class E web
```

### Three programs, and what each may touch

The design comes down to one rule: **the website never runs anyone's code and never sees the hidden data.** A separate worker machine does that, and even the worker hands the model to a throw-away container. Three words will come up on every page from here on — *website*, *worker*, *sandbox* — and this is what each one is. The arrows show who is allowed to talk to whom:

```mermaid
flowchart TB
    W["Website<br/>pages, forms, leaderboard<br/>reads and writes rows"]
    D[("Database and file bucket")]
    K["Worker<br/>holds the hidden data<br/>takes jobs, runs them"]
    S["Sandbox<br/>runs the model<br/>no network, destroyed after"]
    W <--> D
    D <--> K
    K --> S
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class W web
    class K worker
    class S sandbox
    class D data
```

The website and the worker share nothing but the database; they never talk to each other. That is why a second worker machine needs no configuration (it just starts taking jobs), why the site stayed up during a ten-hour network outage that cut the worker off, and why the queue is a database table rather than a separate service.

### Where things run

| What | Where | Why |
|---|---|---|
| Website | Vercel (free tier) | Hosts Next.js with no servers to manage |
| Database and file bucket | Supabase (free tier) | PostgreSQL and file storage in one account |
| Worker, hidden data, MATLAB | A VM on Arbutus, the Alliance research cloud | The lab controls it; it is the only place the hidden data exists |
| Source code | GitHub, `McMaster-Battery-Research-Group` | Collaborators can read and propose; only the owner merges |

**Files to open:** [README.md](../../README.md) → [prisma/schema.prisma](../../prisma/schema.prisma) → [src/evaluator/worker.ts](../../src/evaluator/worker.ts).

