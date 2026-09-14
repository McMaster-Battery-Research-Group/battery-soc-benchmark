# Battery SOC Benchmark

Researchers upload a battery **state-of-charge estimation** algorithm; we run it against a hidden dataset measured on Tesla Model 3 2170 cells and publish the score on a public leaderboard. Built for Dr. Phillip Kollmeyer's battery research group, McMaster University.

**Live site:** https://battery-soc-benchmark.vercel.app

<p align="center">
  <a href="docs/walkthrough/codebase-walkthrough.pdf">
    <img src="https://img.shields.io/badge/%F0%9F%93%98%20Codebase%20walkthrough-Read%20the%20PDF-7A003C?style=for-the-badge&labelColor=1D2428" alt="Read the codebase walkthrough (PDF)" height="44">
  </a>
</p>

## 📘 [Read the codebase walkthrough (PDF)](docs/walkthrough/codebase-walkthrough.pdf)

Everything about the system on one document — what it does, how each part works, why it was built that way, and where to look in the code — with a diagram for every section, a glossary, and a plain-English summary at the top of every part. Written for developers and non-developers alike.

Prefer it in pieces? The same content is [one page per part](docs/walkthrough/README.md), or [a single Markdown file](docs/walkthrough/ALL-IN-ONE.md).

---

## Run it locally

You need **Node.js 20+**, **Docker Desktop** (running) and **Git**.

```bash
git clone https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark.git
cd battery-soc-benchmark
cp .env.example .env      # the defaults work for local development
npm install
npm run setup             # Postgres in Docker (port 5433) + schema + demo data
npm run dev               # website at http://localhost:3000
```

In a second terminal:

```bash
npm run worker            # processes evaluation jobs — fake scores by default
```

Sign in with a seeded account:

| Role | E-mail | Password |
| --- | --- | --- |
| Admin | `admin@batterysocbenchmark.ca` | `Admin123!` |
| User | `a.rahman@example.edu` | `Password1` |

That is enough to use every page. Two things to know:

- **E-mail** goes to a throw-away Ethereal inbox when `SMTP_HOST` is unset; the preview link is printed in the terminal.
- **Scores are invented** by the mock evaluator (`EVALUATOR=mock`) so the site can be developed without the blinded data or a sandbox. To evaluate for real you need the blinded `.mat` from the lab (never commit it) and, in `.env`: `EVALUATOR=real`, `SOCBENCH_BLIND_DATA=<path>`, `WORKER_RUNTIMES=python,matlab`, plus `docker build -t socbench-eval evaluator` for the Python sandbox. Details: walkthrough, Part 11.

### Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Website with hot reload |
| `npm run worker` | The evaluation worker |
| `npm run typecheck` · `npm run lint` | Type and lint checks |
| `npm run smoke` | Production build + Playwright pass over the main pages (also runs on `git push` when `src/**` changes) |
| `npm run db:studio` | Browse the database |
| `npm run db:push` | Apply a `prisma/schema.prisma` change to the local database |

### On Windows

- Stop the dev server and the worker before `prisma generate` (or `npm install`) — a running process locks the generated client.
- Windows PowerShell 5.1 has no `&&`: run commands on separate lines. The npm scripts chain internally and are fine.

---

Dataset: [doi:10.5683/SP3/ZVTR4B](https://doi.org/10.5683/SP3/ZVTR4B) (Borealis, CC-BY 4.0). Paper: P. J. Kollmeyer, M. Naguib, F. Khanum, A. Emadi, "A Blind Modeling Tool for Standardized Evaluation of Battery State of Charge Estimation Algorithms," IEEE ITEC+EATS 2022, [doi:10.1109/ITEC53557.2022.9813996](https://doi.org/10.1109/ITEC53557.2022.9813996).
