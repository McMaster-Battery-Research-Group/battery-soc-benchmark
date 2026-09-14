<a id="part-8"></a>
## 8. Infrastructure

> **Plain English.** The website deploys itself whenever code is pushed. The worker is a rented Linux computer in the Alliance research cloud that updates itself every ten minutes, restarts only when idle, and runs MATLAB inside a container licensed through the lab's MathWorks account. Secrets sit in files only the worker's own account can read.

Everything so far has described the software; this part is where it physically runs, and how it keeps itself up to date. The diagram is the same three programs as Part 1, now with the services around them:

```mermaid
flowchart TB
    G["GitHub"] -- "push → deploy" --> V["Vercel — the website"]
    G -- "pull every 10 min" --> M["Arbutus VM — worker and hidden data"]
    V <--> S[("Supabase — database and files")]
    M <--> S
    M --> L["MathWorks — licence"]
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class G,L ext
    class V web
    class M worker
    class S data
```

**The VM** is set up by one script: Docker, Node, a no-login service account, the repo checked out with a read-only key, a hardened background service, a firewall that allows only SSH. Secrets and the hidden data are placed by hand afterwards, owned by the service account, readable by nobody else.

**Self-update** runs every ten minutes: fetch the code; if anything changed, rebuild only what it touched (packages, the database client, the sandbox images); then restart the worker — but only if no evaluation is running, otherwise wait for the next tick.

**MATLAB** runs inside MathWorks' own container image, licensed through the lab's account rather than a licence server. A one-time browser sign-in produced a year-long identity token that lives on the VM; for each evaluation the worker exchanges it for a 24-hour token, and only that short-lived token enters the container. The chain, from the long-lived secret to the container:

```mermaid
flowchart TB
    T["Identity token on the VM, valid one year"] --> X["Exchanged with MathWorks before each evaluation"]
    X --> D["24-hour access token"]
    D --> C["Passed into the container, which checks out its licence"]
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef sandbox fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class T danger
    class X,D worker
    class C sandbox
```

**Running it on a laptop** is the same code with different settings: a local Postgres in Docker, files on disk, e-mail to a test inbox. There is no fake scorer; a developer's worker runs the real evaluator, which needs the hidden data and the sandbox image. The seed creates an admin account and one test user, nothing else.

**Files to open:** [provision-arbutus-worker.sh](../../scripts/provision-arbutus-worker.sh) → [vm-update.sh](../../scripts/vm-update.sh) → [Dockerfile.matlab](../../evaluator/Dockerfile.matlab) → [.env.example](../../.env.example).

