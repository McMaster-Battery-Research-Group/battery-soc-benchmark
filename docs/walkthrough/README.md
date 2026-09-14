# Battery SOC Benchmark — codebase walkthrough

This is the whole system explained in one place: what it does, how each part works, why it was built that way, and where to look in the code.

You don't need to be a developer to follow it. Every part starts with a short plain-English summary, and the diagrams are meant to make sense on their own, so you can read those and skip anything in `monospace`. If the codebase is new to you, read it in order once; each part ends with the files to open. Terms are defined in the glossary at the end, and the reference tables (settings, limits, tools) are in the appendix after it, so the main text stays short.

Every diagram uses the same colours: **maroon** for the website, **gold** for the worker machine, **green** for the sandbox, **blue** for data, **grey** for outside services, **purple** for a person, **red** for the hidden data or a risk.

---

---

## Contents

1. [The five-minute version](01-the-five-minute-version.md) — 2 diagrams
2. [How a submission is evaluated](02-how-a-submission-is-evaluated.md) — 4 diagrams
3. [How the score is computed](03-how-the-score-is-computed.md) — 2 diagrams
4. [The database](04-the-database.md) — 1 diagram
5. [Accounts and security](05-accounts-and-security.md) — 1 diagram
6. [The website](06-the-website.md) — 1 diagram
7. [Administration and monitoring](07-administration-and-monitoring.md) — 2 diagrams
8. [Infrastructure](08-infrastructure.md) — 2 diagrams
9. [Changing things](09-changing-things.md) — 0 diagrams
10. [A ten-minute demo](10-a-ten-minute-demo.md) — 0 diagrams
11. [Glossary](11-glossary.md) — 0 diagrams
12. [Appendix: reference tables](12-appendix-reference-tables.md) — 0 diagrams

Read in order the first time; each part opens with a plain-English summary and stands on its own afterwards.

**Read it as one piece:** [ALL-IN-ONE.md](ALL-IN-ONE.md) is the whole walkthrough in a single file (best in an editor or offline), and [the PDF](https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark/raw/main/docs/walkthrough/codebase-walkthrough.pdf) is the same content with every diagram rendered and a clickable contents page.
