<a id="part-11"></a>
## 11. A ten-minute demonstration

1. **Leaderboard.** Rank, weighted error and complexity. Note that every figure is an error and that lower is better.
2. **One result.** The generated interpretation, the scorecard summing to the score, the worst-case trace, and the PDF report.
3. **Submission.** Run a test on the reference package (seconds), then submit it; observe the queue position and the progress indicator.
4. **Admin → Evaluation workers.** The machine that claimed the job: languages, load, console and licence expiry.
5. **Source, in this order.** `schema.prisma` → `claimJob` in `run-job.ts` → the `docker run` invocation in `python-evaluator.ts` → `score()` in `pipeline.py` → `Run_Model.m`.
6. **Conclude with the rule.** The web tier never executes submitted code and never has access to the withheld data.

