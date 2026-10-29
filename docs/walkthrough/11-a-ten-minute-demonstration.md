<a id="part-11"></a>
## 11. A ten-minute demonstration

1. **Leaderboard.** Rank, weighted error, complexity, model size and peak RAM. Note that every figure is an error and that lower is better, and that the *files* badge marks a model whose package can be downloaded.
2. **One result.** The three cards, the scorecard summing to the score, the Charts tab with the donut and the gallery, the withheld-cell panel that shows the error only, the About tab and the PDF report.
3. **Compare.** Three models side by side, then the worst case of one overlaid with the others.
4. **Submission.** Run a test on a reference package (seconds), then submit it with a diagram and a paper link; observe the queue position and the progress indicator.
5. **Admin → Evaluation workers.** The machine that claimed the job: languages, load, console and licence expiry.
6. **Source, in this order.** `schema.prisma` → `claimJob` in `run-job.ts` → the `docker run` invocation and the nonce in `python-evaluator.ts` → `score()` in `pipeline.py` → `Run_Model.m`.
7. **Conclude with the rule.** The web tier never executes submitted code and never has access to the withheld data.

