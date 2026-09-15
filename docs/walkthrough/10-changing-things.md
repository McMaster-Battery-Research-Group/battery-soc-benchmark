<a id="part-10"></a>
## 10. Changing things

The most common changes, and where each one is made. Anything not listed here can be found from the *Files to open* lines in the earlier chapters.

| You want to… | Do this |
|---|---|
| Change a timeout or the daily cap | Admin → Evaluation workers. No deploy; takes effect within 15 s |
| Change the scoring weights | Admin → Scoring weights: edit, preview, save with a reason, optionally notify authors |
| Change the scoring *maths* | Edit `pipeline.py`; re-run the reference models and confirm only the intended scores moved; bump the benchmark version in `socbench_eval/__init__.py` and `benchmark-version.ts`; old results become "legacy" and authors are e-mailed to resubmit |
| Add a metric | A column in `schema.prisma`, an entry in `test-cases.ts`, compute it in `score()`; the scorecard, PDF and CSV pick it up; check the weights still sum to 1 |
| Add a worker machine | Hidden data, `worker.env`, `npm run worker`; it registers itself and starts taking jobs |
| Rotate a secret | Rotate at the source, update Vercel and `/etc/socbench/worker.env`, restart the worker |
| Renew the MATLAB licence (yearly) | The Workers page shows the expiry; repeat the browser sign-in and `matlab-mhlm-setup.sh` |
| Make someone an administrator | Admin → Users → Make admin, or add the address to `ADMIN_EMAILS`; effective on their next request |

