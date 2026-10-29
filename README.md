# Battery SOC Benchmark

Researchers upload a battery **state-of-charge estimation** algorithm; we run it against a withheld dataset measured on Tesla Model 3 2170 cells and publish the score on a public leaderboard. Built for Dr. Phillip Kollmeyer's battery research group at McMaster University, supported by NSERC Discovery Grant RGPIN-2024-06796.

**Live site:** https://batterysocbenchmark.ca

<p align="center">
  <a href="https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark/raw/main/docs/walkthrough/codebase-walkthrough.pdf">
    <img src="https://img.shields.io/badge/%F0%9F%93%98%20Codebase%20manual-Read%20the%20PDF-7A003C?style=for-the-badge&labelColor=1D2428" alt="Read the codebase manual (PDF)" height="44">
  </a>
</p>

## The codebase manual

The whole system in one book: the battery problem it solves, how to use the site, what happens to a submission, how the score is computed, the database, security, administration and infrastructure. Every chapter opens with a plain-language summary and uses real screenshots and figures; a maintenance reference, a ten-minute demonstration script, the glossary and the reference tables are at the back. Written for developers and non-developers alike. The button above opens the PDF (thirteen chapters, about 75 pages, updated October 2026).

Prefer it in pieces? The same content is [one page per chapter](docs/walkthrough/README.md), or [a single Markdown file](docs/walkthrough/ALL-IN-ONE.md).

---

## What the platform does

1. A researcher trains a model on the **open dataset** (three of the four cells, published on Borealis under CC-BY 4.0).
2. They upload a `.zip` holding one `Model.py`, `Model.m` or `Model.p` plus parameter files, describe the model (text, optional paper and code links, a diagram and a write-up), and may choose to share the files.
3. A **worker** on a machine the lab controls claims the job and runs the model, one sample at a time, inside a Docker sandbox with no network, on the **withheld dataset**: 144 drive cycles over four cells and six temperatures, the charging profiles, and 27 robustness runs with an incorrect initial SOC or a biased current sensor.
4. The 18 test-case errors are weighted into one score. The result page shows the scorecard, every figure the lab's original MATLAB evaluation script produced, the per-cycle table and a PDF report; the **leaderboard** ranks every public model, with model size and peak RAM beside the errors.

The one rule behind the architecture: **the web tier never executes submitted code and never has access to the withheld data.** The reference SOC of the withheld m448 cell is the benchmark's answer key and is never served, plotted or downloadable.

## Where it runs

Everything runs on two Ubuntu virtual machines in the Digital Research Alliance of Canada's Arbutus cloud (since 2026-09-21):

| Machine | Carries | Updates itself |
| --- | --- | --- |
| `socbench-web` | Caddy (HTTPS), the Next.js site, PostgreSQL, the uploaded files | every 10 min from `main`: `scripts/web-update.sh` |
| `socbench-eval` | Docker, the Python and MATLAB sandbox images, the withheld data, the worker | every 10 min from `main`, restarting only when idle: `scripts/vm-update.sh` |

Outside the research cloud: GitHub (source and a ten-minute worker-health check), Resend (e-mail from the site's domain) and MathWorks (MATLAB licensed online with a 24-hour token per evaluation). Operations runbooks live in the lab's private repository.

---

## Run it locally

You need **Node.js 20+**, **Docker Desktop** (running) and **Git**.

```bash
git clone https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark.git
cd battery-soc-benchmark
cp .env.example .env      # the defaults work for local development
npm install
npm run setup             # Postgres in Docker (port 5433) + schema + seed accounts
npm run dev               # website at http://localhost:3000
git config core.hooksPath .githooks   # once: the pre-push render smoke test
```

Sign in with a seeded account:

| Role | E-mail | Password |
| --- | --- | --- |
| Admin | `admin@batterysocbenchmark.ca` | `Admin123!` |
| User | `user@example.com` | `Password1` |

E-mail goes to a throw-away Ethereal inbox when `SMTP_HOST` is unset; the preview link is printed in the terminal. Uploaded files are kept under `uploads/`.

## Run evaluations

There is no fake scorer: every result, including a pre-submission test run, comes from the real evaluation pipeline. To process submissions locally you need the withheld dataset from the lab (never commit it) and the Python sandbox image:

```bash
docker build -t socbench-eval evaluator          # the sandbox for Python packages
```

In `.env`:

```
SOCBENCH_BLIND_DATA=/path/to/blind_data.mat
WORKER_RUNTIMES=python            # add ",matlab" on a machine with MATLAB
```

Then, in a second terminal:

```bash
npm run worker
```

The worker registers on **Admin → Evaluation workers** and starts claiming queued jobs. MATLAB packages run inside MathWorks' container image (`evaluator/Dockerfile.matlab`, Linux x86-64) or, failing that, on the host with an allow-listed environment. How it all fits together — the sandbox, the anti-forgery nonce, MATLAB licensing, the queue, the two machines — is in the manual, Chapters 4, 5 and 9.

## Checks

- `npm run typecheck` and `npm run lint`.
- `npm run smoke`: a production build plus a Playwright pass over every public page, a real results page and the comparison page. The pre-push hook runs it whenever a push touches the web tier.
- A security suite of five harnesses (exfiltration, sandbox escape, live API, score tampering, denial of service) tests the platform against itself. It is kept out of the public repository because its payloads are working attacks; its findings are summarised in the manual, Section 7.4.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app/` | Next.js App Router pages: public site, `(app)` signed-in pages, `(admin)` administration, `api/` routes |
| `src/components/` | Charts (including the figure gallery), leaderboard table, scorecard, result summary, forms |
| `src/lib/` | Validation, authorship, scoring and weights, test-case definitions, storage modes, mail, rate limits, PDF report, MAT reader |
| `src/evaluator/` | The worker: queue claiming, the Docker sandbox invocation, result verification, history |
| `evaluator/` | The Python evaluation pipeline (`socbench_eval`), the two Dockerfiles, the example packages |
| `matlab/` | The MATLAB driver that iterates a `Model.m`/`Model.p`, and the script that exported the withheld data |
| `prisma/` | The schema (one file defines every table) and the seed |
| `scripts/` | Provisioning, self-update and cutover scripts for the two machines; maintenance scripts |
| `docs/walkthrough/` | The codebase manual, generated: per-chapter pages, `ALL-IN-ONE.md`, figures and the PDF |
| `security-tests/` | The pre-launch security suite and its findings |
| `tests/smoke/` | The Playwright render test |

---

Dataset: [doi:10.5683/SP3/ZVTR4B](https://doi.org/10.5683/SP3/ZVTR4B) (Borealis, CC-BY 4.0). Paper: P. J. Kollmeyer, M. Naguib, F. Khanum, A. Emadi, "A Blind Modeling Tool for Standardized Evaluation of Battery State of Charge Estimation Algorithms," IEEE ITEC+EATS 2022, [doi:10.1109/ITEC53557.2022.9813996](https://doi.org/10.1109/ITEC53557.2022.9813996).
