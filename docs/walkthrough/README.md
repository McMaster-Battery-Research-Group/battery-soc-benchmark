# Battery SOC Benchmark — the codebase manual

This manual describes the Battery SOC Benchmark as a complete system: the estimation problem it addresses, the evaluation methodology, the web platform through which models are submitted and ranked, and the software and infrastructure that carry out the evaluation. It is written for two audiences. Researchers, students and collaborators who need to understand what the platform does and why it is designed as it is will find each chapter self-contained at the level of its summary and figures. Developers who intend to maintain or extend the platform should read the chapters in full and open the source files listed in each chapter's summary.

The chapters build on one another and are best read in order on a first pass:

- **Chapters 1 to 3** require no programming background. They cover the state-of-charge estimation problem, the architecture of the platform in outline, and the workflow of a researcher who submits a model.
- **Chapters 4 to 9** describe the system one layer at a time: the evaluation pipeline, the scoring methodology, the data model, security, administration and infrastructure.
- **Chapter 10** is a reference for common maintenance tasks and where each is performed.
- **Chapter 11** is a suggested sequence for demonstrating the platform in ten minutes.
- **The glossary and appendix** collect terminology, configuration, limits and schema details so that the chapters remain readable.

All diagrams share one visual vocabulary, introduced in Section 2.4, so that a given kind of component looks the same on every page. Screenshots show the production site as of September 2026.

---

**[Read it as a PDF](codebase-walkthrough.pdf)** (the same content, typeset as a book) or as [a single Markdown file](ALL-IN-ONE.md).

---

## Contents

1. [The estimation problem](01-the-estimation-problem.md) — 8 figures
2. [The platform in outline](02-the-platform-in-outline.md) — 6 figures
3. [Using the platform](03-using-the-platform.md) — 7 figures
4. [The life of a submission](04-the-life-of-a-submission.md) — 7 figures
5. [Scoring methodology](05-scoring-methodology.md) — 3 figures
6. [The data model](06-the-data-model.md) — 1 figure
7. [Accounts and security](07-accounts-and-security.md) — 1 figure
8. [Administration and monitoring](08-administration-and-monitoring.md) — 5 figures
9. [Infrastructure](09-infrastructure.md) — 2 figures
10. [Maintenance reference](10-maintenance-reference.md) — 0 figures
11. [A ten-minute demonstration](11-a-ten-minute-demonstration.md) — 0 figures
12. [Glossary](12-glossary.md) — 0 figures
13. [Appendix: reference tables](13-appendix-reference-tables.md) — 0 figures
