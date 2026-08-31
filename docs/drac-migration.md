# Migrating evaluation (and possibly hosting) to the Digital Research Alliance of Canada

Reference: https://research.mcmaster.ca/free-supercomputing-resources-via-digital-research-alliance-of-canada/ — faculty get an Alliance (CCDB) account within days and can sponsor any number of students; the default access tier is free, and larger needs go through the annual Resource Allocation Competition (RAC). Support: help@sharcnet.ca (SHARCNET is the Ontario partner).

> Items marked **verify** could not be confirmed from the public docs (docs.alliancecan.ca blocks automated access) — check with SHARCNET before relying on them.

## Step 0 — accounts
1. Dr. Kollmeyer applies for an Alliance account at https://ccdb.alliancecan.ca (as PI).
2. He sponsors Ahmad's account (role: student) under his CCDB group. This is what unlocks everything below.

## What DRAC gives us that fits this project

| Need | DRAC service | Fit |
| --- | --- | --- |
| Always-on evaluation worker (`npm run worker`) | **Alliance Cloud** (OpenStack VMs on Arbutus / Béluga / Cedar / Graham clouds) — the "rapid access" cloud allocation includes a small number of *persistent* VMs (**verify** current quota; historically ~10 vCPU / 1 persistent VM per group) | Ideal: outbound-only worker on a persistent VM; replaces laptop / cron endpoint |
| Website + Postgres on campus-like infrastructure | Same cloud VM (or a second one) with public IP + floating DNS | Possible; satisfies IS-00 §26(a) "internally managed" better than Vercel/Supabase (**verify** Alliance's status as a university-affiliated service for the risk assessment) |
| Running the real MATLAB evaluator | Clusters (Graham, Béluga, Narval…) provide MATLAB via `module load matlab` using institutional licences (**verify** McMaster's licence is enabled), or use **MATLAB Runtime (MCR)** with a compiled evaluator — no licence needed at run time | Heavy/parallel evaluation can be a Slurm batch job instead of a live worker |
| Storage for the blinded dataset | Cluster `/project` space (group-owned, backed up) | Keeps the blinded data off the web tier, access-controlled by CCDB group |

## Target architecture (phase 2)

```
Vercel or cloud-VM web app ──► Postgres (Supabase or cloud VM)
                                      ▲
                worker on Alliance Cloud VM (EVALUATOR=matlab or =slurm)
                                      │
            optional: submits sbatch jobs to a cluster, polls results
```

1. **Simplest**: one persistent cloud VM (Ubuntu) running `npm run worker` with `EVALUATOR=matlab` and MATLAB Runtime installed; blinded data on the VM's volume. Zero code change beyond `MatlabEvaluator`.
2. **Scalable**: add a `SlurmEvaluator` that copies the package + blinded data reference to `/project`, submits an `sbatch` script that runs the lab's MATLAB evaluation, and waits for the results JSON. Lets many submissions evaluate in parallel on cluster nodes and keeps the VM tiny.

## Checklist to move the worker

- [ ] PI + sponsored accounts active in CCDB
- [x] Request rapid-access cloud allocation — `def-kollmeyp-prod` on Arbutus; VM `Ahmad-Development-Server` (p8-12gb) since 2026-08-28
- [x] Provision Ubuntu VM (`scripts/provision-arbutus-worker.sh`), clone repo, `npm ci`, copy production env (DATABASE_URL, DIRECT_URL, STORAGE=supabase, SUPABASE_URL, SUPABASE_SERVICE_KEY, SMTP_*, NEXT_PUBLIC_SITE_URL)
- [ ] Install MATLAB Runtime (or confirm `module load matlab` licence) and the lab's evaluation script; implement `src/evaluator/matlab-evaluator.ts`
- [x] Blinded dataset on the VM at `/var/lib/socbench/blind-data/blind_data.mat`, mode 600 owner `socbench`
- [x] Worker runs as `socbench-worker.service` (systemd, `Restart=always`)
- [ ] Update `docs/compliance.md` data-inventory row for blinded data location

## Runbook — the Arbutus worker (live since 2026-08-28)

**What exists**

| Item | Value |
| --- | --- |
| Project / VM | Alliance Cloud (Arbutus), project `def-kollmeyp-prod`, instance **Ahmad-Development-Server** (`p8-12gb`: 8 vCPU, 12 GB, 48 GB root), Ubuntu 24.04 |
| Address | `134.87.10.197` (floating IP; internal `192.168.201.184`) — SSH as `ubuntu` with the *Ahmad-Laptop* key pair; the security group only admits SSH from campus (`130.113.0.0/16`) and the listed home IPs |
| Code | `/opt/socbench` — clone of this repo over SSH using a **read-only GitHub deploy key** (`arbutus-worker (read-only)`; private key in `/var/lib/socbench/.ssh/`) |
| Service | `socbench-worker.service` (systemd, `Restart=always`, `KillSignal=SIGINT` so Ctrl+C-style graceful shutdown applies). Runs as the low-privilege user **`socbench`** (no login shell, member of `docker`), `ProtectSystem=strict`, writable only in `/var/lib/socbench` and `/tmp` |
| Secrets | `/etc/socbench/worker.env` (mode 600, owner socbench) — generated from the laptop's `.env.production` with Linux overrides: `WORKER_RUNTIMES=python`, `WORKER_CONCURRENCY=2`, `SOCBENCH_BLIND_DATA=/var/lib/socbench/blind-data/blind_data.mat`, `SOCBENCH_PYTHON=python3`, no `MATLAB_BIN` |
| Blinded data | `/var/lib/socbench/blind-data/blind_data.mat` (mode 600, owner socbench) — mounted read-only into each sandbox |
| Sandbox | Docker image `socbench-eval` built from `evaluator/Dockerfile`; each evaluation runs with `--network none --read-only --cap-drop ALL`, 2 CPU / 4 GB |
| Firewall | `ufw` default-deny inbound, 22/tcp only; unattended security upgrades on |
| Runtimes | **Python packages only** (`WORKER_RUNTIMES=python`). MATLAB packages stay queued until a worker that can run them (today: the laptop, `python,matlab`) claims them. See *MATLAB on Linux* below |

**Re-create from scratch**

1. Launch an Ubuntu 24.04 instance with a floating IP and a security group allowing SSH from campus/VPN only.
2. On the VM, create the deploy key and register it (read-only) on GitHub:
   ```bash
   sudo useradd --system --create-home --home-dir /var/lib/socbench --shell /usr/sbin/nologin socbench
   sudo -u socbench ssh-keygen -t ed25519 -N "" -C socbench@arbutus-worker -f /var/lib/socbench/.ssh/id_ed25519
   sudo -u socbench bash -c 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts'; sudo cat /var/lib/socbench/.ssh/id_ed25519.pub
   # laptop:  gh repo deploy-key add key.pub --title "arbutus-worker (read-only)" -R AhmadAli137/battery-soc-benchmark
   ```
3. `scp scripts/provision-arbutus-worker.sh ubuntu@<ip>: && ssh ubuntu@<ip> ./provision-arbutus-worker.sh` — installs Docker + Node 22, clones the repo, builds `socbench-eval`, writes the systemd unit, enables ufw.
4. Copy secrets and data (never commit them):
   ```bash
   scp worker.env blind_data.mat ubuntu@<ip>:
   ssh ubuntu@<ip> 'sudo install -m 0600 -o socbench -g socbench worker.env /etc/socbench/worker.env && sudo install -m 0600 -o socbench -g socbench blind_data.mat /var/lib/socbench/blind-data/ && shred -u worker.env blind_data.mat'
   ```
5. `sudo systemctl start socbench-worker` — it appears on *Admin → Evaluation workers* within 15 s.

**Day to day**

| Task | Command (on the VM) |
| --- | --- |
| Logs | `sudo journalctl -u socbench-worker -f` (the last 200 lines are also on *Admin → Evaluation workers*) |
| Update code | **Automatic.** `socbench-update.timer` runs `scripts/vm-update.sh` every 10 min: fetches `main`, runs `npm ci` / `prisma generate` / image rebuild only when the relevant files changed, and restarts the worker **only when it is idle** (a restart is deferred while an evaluation is running). Force it now: `sudo /opt/socbench/scripts/vm-update.sh`. History: `sudo journalctl -u socbench-update -n 50` |
| Rebuild sandbox (monthly, or when `evaluator/` changes) | `sudo docker build -t socbench-eval /opt/socbench/evaluator && sudo systemctl restart socbench-worker` (`--build-arg TORCH=1` for PyTorch) |
| Pause / stop | *Admin → Evaluation workers* buttons, or `sudo systemctl stop socbench-worker` (graceful: in-flight jobs are returned to the queue) |
| Change env | edit `/etc/socbench/worker.env`, then `sudo systemctl restart socbench-worker`. Policy limits (evaluation/test-run time limits, daily cap) do NOT live here — set them on *Admin → Evaluation workers*, no restart needed |

**MATLAB on the VM** — via MathWorks *online licensing* with the lab's campus-wide licence (Dr. Kollmeyer's MathWorks account; he has confirmed the licence permits this use). The base image `mathworks/matlab-deep-learning:r2026a` (24.5 GB on disk) already contains every toolbox submissions have needed, so `evaluator/Dockerfile.matlab` only adds Python + the harness and remaps the `matlab` user to the `socbench` uid.

How the licence works here: the browser sign-in yields a **one-year identity token**; the worker keeps it in `/etc/socbench/matlab-mhlm.json` (600, owner socbench) and, before each MATLAB evaluation, exchanges it at `login.mathworks.com` for a **24-hour access token** that is passed into the container as `MLM_WEB_USER_CRED` (the same mechanism MathWorks' own matlab-proxy uses). Nothing licence-related is baked into the image, so a submission can at most read a token that dies within a day. `docker commit` of the logged-in container (the MathWorks Answers recipe) is *not* used — it hangs on Docker's containerd snapshotter with a 24 GB image and would put the year-long token inside the sandbox.

1. Build (auto by `vm-update.sh` once the image exists; first time by hand):
   `sudo docker build -t socbench-eval-matlab -f /opt/socbench/evaluator/Dockerfile.matlab --build-arg MATLAB_UID=$(id -u socbench) --build-arg MATLAB_GID=$(id -g socbench) /opt/socbench`
2. **One-time sign-in** (the licence holder or someone he trusts types the credentials; the terminal `-licmode onlinelicensing` prompt does not work with SSO accounts — use the browser UI):
   ```bash
   sudo docker run -d --name socbench-matlab-login --user $(id -u socbench):$(id -g socbench) -p 127.0.0.1:8888:8888 --entrypoint /bin/run.sh socbench-eval-matlab -browser
   # laptop:  ssh -L 8888:localhost:8888 ubuntu@<vm>   → open http://localhost:8888, sign in (SSO/2FA fine), pick the licence
   ```
3. `sudo bash /opt/socbench/scripts/matlab-mhlm-setup.sh` — extracts the identity token to `/etc/socbench/matlab-mhlm.json`, tests the exchange and a licensed `matlab -batch` inside the image, removes the login container and any copies.
4. Worker env (`/etc/socbench/worker.env`): `EVAL_SANDBOX_MATLAB_IMAGE="socbench-eval-matlab:latest"`, `EVAL_MATLAB_MHLM_FILE="/etc/socbench/matlab-mhlm.json"`, `EVAL_MATLAB_NETWORK="bridge"` (needed for the licence check-out; Python containers keep `--network none`), `WORKER_RUNTIMES="python,matlab"`, `EVAL_MEMORY="6g"`. Restart the service; the Workers page shows `runtimes python, matlab`.
5. Parity (done 2026-08-28): the four MATLAB example packages (#78–#81, private) match the previous host on all 20 score columns to 0.000 (EKF: one column differs by 0.001). Complexity calibration: the worker now logs `timing: N µs per sample` for every run. Measured on the VM — CC 0.069 µs/sample, FNN/LSTM land in the same bins as before (9 / 8) with the laptop constant `SOCBENCH_CAL_MATLAB=3.5e-8`, so that value is kept. Known deviation: the EKF example bins at **10** here versus 6 on the laptop (42 µs/sample — per-call overhead of loop-heavy MATLAB code is much higher on the 2-vCPU sandbox than on a desktop CPU, while vectorised/NN code is not). Complexity is informational only and never enters the score; if the lab wants historical bins preserved for loop-heavy models, that needs a per-runtime *overhead* term in `pipeline.complexity()`, not a different constant.
6. Renewal: the identity token expires after one year (date is in the json). Repeat steps 2–3; the worker reports "token exchange failed" in the job log when it has lapsed.
7. Egress hardening (todo): replace `bridge` with a Docker network whose only allowed destinations are `login.mathworks.com` / `licensing.mathworks.com` (443). Until then a MATLAB submission has general outbound network access (still no inbound, read-only FS, no privileges, no secrets).
8. Known issue reported by Paarth (earlier attempt): MATLAB in Docker "wouldn't close". Our harness runs `matlab -batch` (exits on its own) with a hard timeout, and the worker `docker kill`s the container on timeout/cancel, so a hung MATLAB cannot pin the slot.

**Complexity calibration** — `SOCBENCH_CAL_PYTHON` is machine-specific (seconds per sample of the reference Coulomb counter). Re-measure whenever the VM flavour changes: evaluate `evaluator/examples/coulomb-counter.python.zip` and set the constant to its `secondsPerSample` so that the Coulomb counter lands in complexity bin 1. Measured 2026-08-28 on p8-12gb: **1.80 µs/sample** (laptop: 0.92 µs) → `SOCBENCH_CAL_PYTHON="1.8e-6"` in `worker.env`. Parity check the same day: the CC reference package scored weighted error 15.366 % on both hosts.

## Security requirements for the DRAC worker (added 2026-08-26)

Submissions are untrusted code — treat the VM as hostile-workload host. See `security.md` for the full status list.

- [x] Use an **Alliance Cloud (Arbutus) VM**, not the batch clusters: running third-party code on shared login/compute nodes is outside the acceptable-use terms and would let a submission probe the cluster.
- [ ] Install Docker (or Apptainer) and build both sandbox images: `docker build -t socbench-eval evaluator` and `docker build -t socbench-eval-matlab -f evaluator/Dockerfile.matlab --build-arg MATLAB_RELEASE=<release> --build-arg PRODUCTS="…" evaluator`. Set `EVAL_SANDBOX=docker`, `EVAL_SANDBOX_MATLAB_IMAGE=socbench-eval-matlab`, `EVAL_MATLAB_LICENSE=<port@licence-host>` (and `EVAL_MATLAB_NETWORK=bridge` only if that host must be reachable). This closes the host-mode MATLAB gap that exists on the laptop.
- [x] (done for the socbench user + systemd hardening; `/project` not used) Run the worker as a **non-sudo service user** under systemd (`Restart=always`); repo read-only to it; `.env.production` and `blind_data.mat` mode 600 owned by that user; nothing on `/project` or `/scratch` group-readable.
- [ ] Firewall: `ufw default deny incoming`; SSH keys only (no passwords), ideally restricted to campus/VPN ranges; outbound allowed only to Supabase (5432/6543 + 443), the SMTP host and the MATLAB licence server.
- [x] `unattended-upgrades` on (rebuild images monthly still manual); rebuild the sandbox images monthly; keep Docker's daemon socket inaccessible to the service user except through the group.
- [ ] Update `compliance.md` §26(b) to name the Alliance VM as the processing location for third-party model IP and the blinded data; note the Alliance's own security policy.
- [ ] After migration: remove blinded data, `.env.production` and the scheduled task from the laptop; rotate the Supabase secrets once more so any laptop copy is dead.
