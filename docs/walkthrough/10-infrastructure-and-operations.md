<a id="part-10"></a>
## 10. 🏗️ Infrastructure and operations

> 💡 **Plain English.** The website is hosted by Vercel and deploys itself whenever code is pushed. The database and file storage are hosted by Supabase. The worker is a rented Linux computer in the Alliance research cloud that updates itself every ten minutes, restarts only when idle, and runs MATLAB inside a container licensed through Dr. Kollmeyer's MathWorks account. Secrets live in files only the worker's own account can read.

### 🗺️ Deployment topology

```mermaid
flowchart TB
    GH["🐙 GitHub<br/>McMaster-Battery-Research-Group/battery-soc-benchmark"]
    V["🌐 Vercel<br/>website, iad1, 60 s functions"]
    VM["⚙️ Arbutus VM<br/>Ubuntu 24.04 · 8 vCPU · 12 GB<br/>socbench-worker.service"]
    GA["💓 GitHub Action<br/>worker-health"]
    SB[("🗄️ Supabase<br/>PostgreSQL via pooler :6543<br/>🪣 private bucket 'packages'")]
    MW["🔑 login.mathworks.com<br/>licence token exchange"]
    SMTP["✉️ SMTP"]
    GH -- "push to main → auto-deploy" --> V
    GH -- "git fetch every 10 min<br/>(read-only deploy key)" --> VM
    GH -- "cron every 10 min" --> GA
    V <--> SB
    VM <--> SB
    VM --> MW
    VM --> SMTP
    V --> SMTP
    GA --> V
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class GH,GA,MW,SMTP ext
    class V web
    class VM worker
    class SB data
```

### 🏗️ The VM, as provisioned by one script

[provision-arbutus-worker.sh](../../scripts/provision-arbutus-worker.sh) is idempotent — safe to re-run — and copies **no secrets and no blinded data**; those are placed by hand afterwards.

```mermaid
flowchart TB
    A["apt: git, ufw, unattended-upgrades"] --> B["Docker from the official repo"]
    B --> C["Node 22"]
    C --> D["system user <b>socbench</b><br/>no login shell · in the docker group<br/>/etc/socbench and /var/lib/socbench/blind-data at mode 0750"]
    D --> E["repo → /opt/socbench (read-only deploy key)<br/>npm ci · prisma generate · build socbench-eval"]
    E --> F["systemd unit socbench-worker.service<br/>+ socbench-update.timer (every 10 min)"]
    F --> G["ufw: deny inbound, allow SSH only<br/>unattended security upgrades"]
    G --> H["by hand: worker.env (600) · blind_data.mat (600)<br/>MATLAB image build · licence sign-in"]
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class A,B,C,D,E,F,G worker
    class H danger
```

The systemd unit is hardened: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`, write access only to its own state directory and `/tmp`, `ConditionPathExists=/etc/socbench/worker.env` so it cannot start before secrets land, `Restart=always`, and `KillSignal=SIGINT` so the worker's graceful shutdown hands jobs back to the queue rather than abandoning them.

### 🔁 Self-update, without killing an evaluation

[vm-update.sh](../../scripts/vm-update.sh) runs from a timer every 10 minutes.

```mermaid
flowchart TB
    A["git fetch origin main"] --> B{"changed, or a<br/>restart still pending?"}
    B -- no --> Z["exit"]
    B -- yes --> C["git reset --hard origin/main<br/>(a deploy target is never blocked by a stray edit)"]
    C --> D["<b>only what changed:</b><br/>package-lock.json → npm ci<br/>schema.prisma → prisma generate<br/>evaluator/ → rebuild socbench-eval<br/>evaluator/ or matlab/ → rebuild the<br/>MATLAB image (if it exists here)"]
    D --> I["touch /run/socbench-restart-pending"]
    I --> J{"any socbench-* container<br/>running?"}
    J -- yes --> K["defer — 'worker busy,<br/>restart at the next tick'"]
    J -- no --> L["systemctl restart socbench-worker<br/>clear the flag"]
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class A,B,C,D,I,J worker
    class Z ext
    class K danger
    class L good
```

### 🔑 MATLAB inside the sandbox, and how it is licensed

The image `socbench-eval-matlab` is MathWorks' `matlab-deep-learning:r2026a` (24.5 GB, every toolbox submissions have needed) plus Python and the harness, with the image's `matlab` user **remapped to the `socbench` uid** so the blinded data can stay mode 600 and the licence file is owned by the same account. No licence material is baked into the image.

```mermaid
sequenceDiagram
    participant O as 👤 Licence holder
    participant VM as ⚙️ VM
    participant MW as 🔑 MathWorks
    participant S as 🐳 Sandbox

    rect rgb(239,230,245)
    O->>VM: one-time browser sign-in
    VM->>VM: 1-year identity token<br/>→ file, mode 600
    end
    rect rgb(255,243,214)
    Note over VM: per MATLAB evaluation
    VM->>MW: identity token
    MW-->>VM: 24 h access token
    VM->>S: run with access token
    S->>MW: licence check-out
    Note over S: identity token<br/>never enters
    end
```

The worst a malicious MATLAB submission can do is read a token that expires within a day and licenses nothing but MATLAB. The identity token's expiry date is shown on the Workers page; renewal is repeating the sign-in.

### 🐳 The two sandbox images

| | `socbench-eval` (Python) | `socbench-eval-matlab` |
|---|---|---|
| Base | `python:3.12-slim` | `mathworks/matlab-deep-learning:r2026a` |
| Adds | numpy, scipy; optional `--build-arg TORCH=1` (+ ~800 MB CPU PyTorch) | Python 3, numpy, scipy, `Run_Model.m` |
| User | `evaluator`, uid 1000, no login | `matlab`, remapped to the worker's uid |
| Entrypoint | `python -m socbench_eval` | `python3 -m socbench_eval` (Python still drives MATLAB) |
| Build context | `evaluator/` | repo root (needs `matlab/`) |
| Baked in | `dryrun_data.mat` — dry runs mount nothing | same |

### 🪣 Storage abstraction

```mermaid
flowchart TB
    I["ModelStorage interface<br/>put · getBytes · materialize · remove · exists"]
    L["<b>LocalStorage</b> (development)<br/>files under UPLOAD_DIR · keys are basenames only"]
    S["<b>SupabaseStorage</b> (production)<br/>private bucket 'packages'<br/>keys submissions/… or dry-runs/…<br/>signed upload URLs valid ~2 h<br/>credentials checked lazily so 'next build' needs no secrets"]
    M["materialize(key) → temp file for the evaluator"]
    I --> L
    I --> S
    S --> M
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    class I web
    class L ext
    class S data
    class M worker
```

### ⚙️ Configuration: the environment variables, by purpose

| Group | Variables |
|---|---|
| Database | `DATABASE_URL` (pooler, 6543), `DIRECT_URL` (5432, migrations only) |
| Web / auth | `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`, `CRON_SECRET` |
| Mail | `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `ADMIN_NOTIFY_EMAIL` |
| Storage | `STORAGE` (local / supabase), `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` |
| Evaluator | `SOCBENCH_BLIND_DATA`, `SOCBENCH_PYTHON`, `MATLAB_BIN`, `WORKER_CONCURRENCY`, `WORKER_RUNTIMES` |
| Sandbox | `EVAL_SANDBOX`, `EVAL_SANDBOX_IMAGE`, `EVAL_SANDBOX_MATLAB_IMAGE`, `EVAL_MATLAB_MHLM_FILE`, `EVAL_MATLAB_NETWORK`, `EVAL_CPUS`, `EVAL_MEMORY`, `EVAL_PIDS` |
| Calibration | `SOCBENCH_CAL_PYTHON`, `SOCBENCH_CAL_MATLAB` |

Every line is annotated in [.env.example](../../.env.example). Production values live only on Vercel (website) and in `/etc/socbench/worker.env` (worker, mode 600).

### ✅ Tests and the push hook

```mermaid
flowchart TB
    A["git push"] --> B{"diff touches src/**,<br/>package-lock or next.config?"}
    B -- no --> P["push"]
    B -- yes --> C["npm run smoke<br/>= production build + Playwright"]
    C --> D["15 public routes: no 5xx, no page errors,<br/>no console errors (two local-only artefacts filtered)<br/>+ a real results page + a compare page when data exists"]
    D -- pass --> P
    D -- fail --> X["push aborted;<br/>npx playwright show-report"]
    S["SKIP_SMOKE=1"] -.-> P
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef ext fill:#F0F0F0,stroke:#495965,color:#1d2428
    class A,B,C,D web
    class P good
    class X danger
    class S ext
```

### ⚠️ The 1 September outage, as it unfolded

The event that shaped the monitoring design. Nothing on the VM was wrong; the route between the research cloud and the part of the internet where the database lives had disappeared overnight.

```mermaid
%%{init: {"gantt": {"fontSize": 15, "sectionFontSize": 15, "barHeight": 28, "barGap": 6, "leftPadding": 90}}}%%
gantt
    title 1 September 2026 (UTC)
    dateFormat HH:mm
    axisFormat %H:%M
    section Worker
    normal heartbeats                :done, 00:00, 06:56
    cannot reach database, retrying  :crit, 07:01, 17:20
    laptop worker takes the MATLAB job :active, 17:55, 18:20
    section People
    nobody is told                   :07:01, 17:10
    admin notices "offline 10 h"     :milestone, 17:10, 0m
    diagnosed as upstream routing    :17:12, 17:40
    section Outcome
    outage alerting built + deployed :18:00, 19:00
```

### 🚀 Developer bootstrap

```
git clone …
cp .env.example .env
npm install
npm run setup     # Postgres in Docker on port 5433 + schema + seed accounts
npm run dev       # website
npm run worker    # in a second terminal — needs the blinded data and the sandbox image
```

The seed wipes and creates an admin account, one test user (`user@example.com` / `Password1`) and one open contest — and **no submissions or results**, because there is no fake scorer; the leaderboard fills as real evaluations run. Two things that bite on Windows: stop the dev server and the worker before `prisma generate` (a running process locks the generated client), and PowerShell 5.1 has no `&&` — run commands on separate lines.

📌 **Files to open, in order:** [provision-arbutus-worker.sh](../../scripts/provision-arbutus-worker.sh) → [vm-update.sh](../../scripts/vm-update.sh) → [Dockerfile](../../evaluator/Dockerfile) → [Dockerfile.matlab](../../evaluator/Dockerfile.matlab) → [matlab-mhlm-setup.sh](../../scripts/matlab-mhlm-setup.sh) → [storage.ts](../../src/lib/storage.ts) → [playwright.smoke.config.ts](../../playwright.smoke.config.ts).

