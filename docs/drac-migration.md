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
- [ ] Request rapid-access cloud allocation (persistent VM, ≥ 2 vCPU / 4 GB) via the Alliance cloud request form
- [ ] Provision Ubuntu VM, install Node 20, clone repo, `npm ci`, copy production `.env` (DATABASE_URL, DIRECT_URL, STORAGE=blob, BLOB_READ_WRITE_TOKEN, SMTP_*, NEXT_PUBLIC_SITE_URL)
- [ ] Install MATLAB Runtime (or confirm `module load matlab` licence) and the lab's evaluation script; implement `src/evaluator/matlab-evaluator.ts`
- [ ] Copy blinded dataset to the VM (or `/project`) with group-only permissions
- [ ] Run the worker as a systemd service (`Restart=always`); disable the cron-job.org ping
- [ ] Update `docs/compliance.md` data-inventory row for blinded data location
