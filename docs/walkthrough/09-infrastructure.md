<a id="part-9"></a>
## 9. Infrastructure

> **In this chapter.** Where the software physically runs, how it deploys and updates itself, how MATLAB is licensed inside a container, and how to run everything on a laptop.

### 9.1 The services

The website deploys itself whenever code is pushed. The worker is a rented Linux computer in the Alliance research cloud that updates itself every ten minutes, restarts only when idle, and runs MATLAB inside a container licensed through the lab's MathWorks account.

```mermaid
flowchart TB
    G[/"GitHub"/] -- "push → deploy" --> V["Vercel — the website"]
    G -- "pull every 10 min" --> M[["Arbutus VM — worker and hidden data"]]
    V <--> S[("Supabase — database and files")]
    M <--> S
    M --> L[/"MathWorks — licence"/]
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class G,L ext
    class V web
    class M worker
    class S data
```

Figure 9.1. The same three programs as Chapter 2, with the services around them.

### 9.2 The virtual machine

One script sets the machine up: Docker; Node.js, which runs the website's language outside a browser; a service account with no login that exists only to run the worker; the code checked out with a key that can download but never change it; a hardened background service; and a firewall that allows nothing but SSH. Secrets and the hidden data are placed by hand afterwards, owned by the service account and readable by nobody else.

**Self-update** runs every ten minutes: fetch the code; if anything changed, rebuild only what it touched (packages, the database client, the sandbox images); then restart the worker, but only if no evaluation is running, otherwise wait for the next tick.

### 9.3 MATLAB inside a container

MATLAB runs inside MathWorks' own container image (the template a container is started from) and is licensed through the lab's account rather than a licence server. A one-time browser sign-in produced a year-long identity token that lives on the VM. For each evaluation the worker exchanges it for a 24-hour token, and only that short-lived token enters the container.

```mermaid
flowchart TB
    T>"Identity token on the VM, valid one year"] --> X[["Exchanged with MathWorks before each evaluation"]]
    X --> D[["24-hour access token"]]
    D --> C{{"Passed into the container, which checks out its licence"}}
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class T danger
    class X,D worker
    class C sandbox
```

Figure 9.2. The licence chain. The long-lived secret never enters the sandbox.

### 9.4 Before code reaches production

A push that touches the website runs a browser test pass over the main pages (using Playwright) and is refused if any page errors. The site then deploys itself, and the VM picks the change up within ten minutes.

### 9.5 Running it on a laptop

It is the same code with different settings: a local PostgreSQL database in Docker, files on disk, e-mail to a test inbox. There is no fake scorer; a developer's worker runs the real evaluator, which needs the hidden data and the sandbox image. The **seed**, the script that fills an empty database with starter rows, creates an administrator account and one test user and nothing else. The README has the five commands.

**Files to open:** [provision-arbutus-worker.sh](../../scripts/provision-arbutus-worker.sh) → [vm-update.sh](../../scripts/vm-update.sh) → [Dockerfile.matlab](../../evaluator/Dockerfile.matlab) → [.env.example](../../.env.example).

