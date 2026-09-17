# Battery SOC Benchmark

Researchers upload a battery **state-of-charge estimation** algorithm; we run it against a hidden dataset measured on Tesla Model 3 2170 cells and publish the score on a public leaderboard. Built for Dr. Phillip Kollmeyer's battery research group, McMaster University.

**Live site:** https://battery-soc-benchmark.vercel.app

<p align="center">
  <a href="https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark/raw/main/docs/walkthrough/codebase-walkthrough.pdf">
    <img src="https://img.shields.io/badge/%F0%9F%93%98%20Codebase%20manual-Read%20the%20PDF-7A003C?style=for-the-badge&labelColor=1D2428" alt="Read the codebase manual (PDF)" height="44">
  </a>
</p>

## The codebase manual

The whole system in one book: the battery problem it solves, how to use the site, what happens to a submission, how the score is computed, the database, security, administration and infrastructure. Every chapter opens with a plain-language summary and uses real screenshots and figures; the glossary and reference tables are at the back. Written for developers and non-developers alike. The button above opens the PDF, about 50 pages.

Prefer it in pieces? The same content is [one page per chapter](docs/walkthrough/README.md), or [a single Markdown file](docs/walkthrough/ALL-IN-ONE.md).

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
```

Sign in with a seeded account:

| Role | E-mail | Password |
| --- | --- | --- |
| Admin | `admin@batterysocbenchmark.ca` | `Admin123!` |
| User | `user@example.com` | `Password1` |

E-mail goes to a throw-away Ethereal inbox when `SMTP_HOST` is unset; the preview link is printed in the terminal.

## Run evaluations

There is no fake scorer: every result, including a dry run, comes from the real evaluation pipeline. To process submissions locally you need the blinded dataset from the lab (never commit it) and the Python sandbox image:

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

The worker registers on **Admin → Evaluation workers** and starts claiming queued jobs. How it all fits together — the sandbox, MATLAB, the queue, the VM that runs production — is in the manual, Chapters 4, 5 and 9.

---

Dataset: [doi:10.5683/SP3/ZVTR4B](https://doi.org/10.5683/SP3/ZVTR4B) (Borealis, CC-BY 4.0). Paper: P. J. Kollmeyer, M. Naguib, F. Khanum, A. Emadi, "A Blind Modeling Tool for Standardized Evaluation of Battery State of Charge Estimation Algorithms," IEEE ITEC+EATS 2022, [doi:10.1109/ITEC53557.2022.9813996](https://doi.org/10.1109/ITEC53557.2022.9813996).
