## 15. 🎬 A demo order that tells the story

About ten minutes.

```mermaid
flowchart TB
    A["1 Leaderboard<br/>the product"] --> B["2 One result<br/>insights, scorecard, key cases,<br/>worst-case trace, PDF"]
    B --> C["3 Submit<br/>dry run live (12 s), then submit;<br/>watch the queue and the progress bar"]
    C --> D["4 Admin → Workers<br/>the machine that took it: runtimes,<br/>load, console, licence expiry"]
    D --> E["5 Code, in order<br/>schema.prisma → claimJob →<br/>the docker run line → score() → Run_Model.m"]
    E --> F["6 Close on the rule<br/>the website never runs anyone's code,<br/>never sees the blinded data"]
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef worker fill:#FFF3D6,stroke:#B8860B,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class A,B web
    class C person
    class D worker
    class E data
    class F good
```

1. **Leaderboard** — rank, weighted error, complexity, the column groups.
2. **Open one result** — the plain-English insights, the 18-row scorecard summing to the score, key cases (blinded vs non-blinded cell, cold temperature, wrong initial SOC, sensor offset), the worst-case trace, the PDF.
3. **`/submit` with a reference package** — run a dry run live, watch the console stream, then submit. Show the queue position and the live progress bar.
4. **Admin → Workers** — the machine that just picked it up. Mention the outage alerting.
5. **Code, in this order**: `schema.prisma` (the tables you just saw) → `run-job.ts` `claimJob` (the compare-and-swap) → `python-evaluator.ts` (the `docker run` line) → `pipeline.py` `score()` (the matrix R and the weights) → `Run_Model.m` (all 40 lines of MATLAB).
6. **Close on the design rule.**
