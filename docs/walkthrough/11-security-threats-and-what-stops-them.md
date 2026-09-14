<a id="part-11"></a>
## 11. 🛡️ Security: threats and what stops them

> 💡 **Plain English.** The system runs code written by strangers, on a machine that holds a secret dataset, and it does so in public. This part lists what could go wrong and, for each, the specific thing that prevents it. Most defences are layers: a model would have to break out of several boxes in a row to do any harm.

### 🧅 The onion

```mermaid
flowchart TB
    subgraph L0["The internet"]
        subgraph L1["Website on Vercel — no code execution, no blinded data, no worker access"]
            subgraph L2["Worker VM — firewall, no-login service user, secrets mode 600, hardened systemd"]
                subgraph L3["Docker container — no network, read-only root, no privileges, memory and CPU caps"]
                    M["📦 the submitted model"]
                end
            end
        end
    end
    style L0 fill:#F0F0F0,stroke:#495965
    style L1 fill:#F2E6EC,stroke:#7A003C
    style L2 fill:#FFF3D6,stroke:#B8860B
    style L3 fill:#E6F2EC,stroke:#0E5B3D
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class M danger
```

### 🔑 Where every secret lives

```mermaid
flowchart TB
    subgraph VER["Vercel environment"]
        V1["DATABASE_URL · AUTH_SECRET<br/>SMTP_PASS · SUPABASE_SERVICE_KEY<br/>OPS_HEALTH_TOKEN · CRON_SECRET"]
    end
    subgraph VMS["VM — /etc/socbench, mode 600"]
        W1["worker.env — the same database,<br/>storage and SMTP secrets"]
        W2["matlab-mhlm.json —<br/>the 1-year MATLAB identity token"]
        W3["🔐 blind-data/blind_data.mat —<br/>the answer key"]
    end
    subgraph GHS["GitHub"]
        G1["repo secret OPS_HEALTH_URL"]
        G2["read-only deploy key on the VM"]
    end
    subgraph NEVER["Never"]
        N1["in the repository · in a Docker image<br/>in a job log · in an e-mail"]
    end
    V1 ~~~ W1 ~~~ W2 ~~~ W3
    W3 ~~~ G1 ~~~ G2
    G2 ~~~ N1
    style VER fill:#F2E6EC,stroke:#7A003C
    style VMS fill:#FFF3D6,stroke:#B8860B
    style GHS fill:#F0F0F0,stroke:#495965
    style NEVER fill:#FFE5DF,stroke:#B3261E
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    class V1,W1,W2,W3,G1,G2,N1 danger
```

### 🛡️ Threats and defences

| Threat | Defence | Where |
|---|---|---|
| Model exfiltrates the blinded data | `--network none`; container destroyed after the run; only `/out` is writable and only results are read from it | python-evaluator.ts |
| Model attacks the host | read-only root, `--cap-drop ALL`, `no-new-privileges`, runs as the unprivileged worker uid, pid/memory/CPU caps | python-evaluator.ts |
| Model reads worker secrets | the container never receives the host environment; in host mode only an allow-list of variables is passed | `HOST_ENV_ALLOW` |
| Model steals the MATLAB licence | only a 24-hour access token enters the container; the year-long identity token never does | `mhlmLicenseEnv()` |
| Zip bomb / path traversal / symlink escape | entry, size and ratio limits; path and attribute checks — on the website *and* again in the evaluator | package-check.ts, `safe_extract` |
| Runaway evaluation | hard timeout inside and outside the container; `docker kill` + process-group kill | `killTree` |
| Queue flooding | 3 submissions/day, 5 dry runs/hour, 30 upload URLs/hour | eval-settings, dry-run-quota, rate-limit |
| Password guessing | bcrypt cost 11; 10 attempts / 15 min per account, 40 per IP | auth.ts, rate-limit.ts |
| Account enumeration | reset and resend endpoints answer identically whether or not the address exists | (auth)/actions.ts |
| Link scanners consuming one-time tokens | verification and invitation decisions are POSTs; GETs are side-effect free | verify/actions.ts, collab |
| Open redirect after login | `next` must start with `/` | loginAction |
| Tampered upload key | keys must match `OBJECT_KEY_RE` | submit/actions.ts |
| Forged form data | zod on every input; `requireUser`/`requireAdmin` inside every action, not just middleware | validation.ts, auth.ts |
| One compromised admin wipes the rest | admins cannot be deleted until demoted; nobody can change their own role | admin/actions.ts |
| Secrets in logs | licence values redacted from the docker command before it is logged; `CRON_SECRET` accepted only in a header, never a URL | python-evaluator.ts, jobs/run |
| Browser-side attacks | strict CSP, HSTS, `frame-ancestors 'none'`, nosniff | next.config.ts |
| Worker VM exposure | ufw default-deny, SSH only from listed addresses, no-login service user, `ProtectSystem=strict` | provision script |
| Silent outage | health endpoint + GitHub Action; one alert per transition | worker-health |

### ⚠️ What is deliberately *not* defended, and why

- **A model can burn its full time budget doing nothing.** Accepted: the cap is per submission and per day, so the cost is bounded.
- **A model can read the blinded data into memory.** Unavoidable — it has to, to be scored. The defence is that nothing it computes can leave except the SOC estimates we read back.
- **Host-mode MATLAB (the laptop fallback) is not sandboxed.** Documented as "dedicated low-privilege account only"; the production path is always the container.
- **The worker VM has general outbound network access.** On the roadmap: an egress allow-list to the database, SMTP and MathWorks only.

📌 **Files to open, in order:** [python-evaluator.ts](../../src/evaluator/python-evaluator.ts) → [package-check.ts](../../src/lib/package-check.ts) → [rate-limit.ts](../../src/lib/rate-limit.ts) → [next.config.ts](../../next.config.ts) → [provision-arbutus-worker.sh](../../scripts/provision-arbutus-worker.sh).

