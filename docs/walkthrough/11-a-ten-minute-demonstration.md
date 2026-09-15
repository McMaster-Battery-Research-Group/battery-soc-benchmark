<a id="part-11"></a>
## 11. A ten-minute demonstration

1. **Leaderboard.** Rank, weighted error, complexity. Point out that the numbers are errors and lower is better.
2. **One result.** The plain-language summary, the scorecard summing to the score, the worst-case trace, the PDF download.
3. **Submit.** Run a test on the reference package live (seconds), then submit it; watch the queue position and the progress bar.
4. **Admin → Evaluation workers.** The machine that just took it: languages, load, console, licence expiry.
5. **Code, in this order.** `schema.prisma` → `claimJob` in `run-job.ts` → the `docker run` line in `python-evaluator.ts` → `score()` in `pipeline.py` → `Run_Model.m`.
6. **Close on the rule.** The website never runs anyone's code and never sees the hidden data.

