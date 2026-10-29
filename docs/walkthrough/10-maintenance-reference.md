<a id="part-10"></a>
## 10. Maintenance reference

The most common maintenance tasks and where each is performed. Anything not listed can be located from the *Files to open* entries of the preceding chapters.

| Task | Procedure |
|---|---|
| Deploy a change | Merge to `main`; both machines adopt it within 10 min. To deploy at once, or when the schema changed: on the web host `sudo /opt/socbench/scripts/web-update.sh`, then on the worker `sudo bash /opt/socbench/scripts/vm-update.sh`, in that order |
| Change a timeout or the daily submission limit | Admin → Evaluation workers. No deployment; effective within 15 s |
| Revise the scoring weights | Admin → Scoring weights: edit, preview, save with a justification, optionally notify authors |
| Change the scoring *computation* | Edit `pipeline.py`; re-run the reference models and confirm that only the intended scores changed; increment the benchmark version in `socbench_eval/__init__.py` and `benchmark-version.ts`; existing results become "legacy" and their authors are invited to resubmit |
| Add a metric | Add a column in `schema.prisma`, an entry in `test-cases.ts` (label and chart name), and its computation in `score()`; the scorecard, charts, PDF and CSV pick it up; confirm the weights still sum to 1 |
| Add a MATLAB toolbox | Add the product to the `mpm install` line of `Dockerfile.matlab`; the worker rebuilds the image on its next update (about half an hour); verify with a test run of a package that uses it |
| Add a worker machine | Provide the withheld data and `worker.env`, then `npm run worker`; the machine registers itself and begins claiming jobs |
| Rotate a secret | Rotate at the source, update `/etc/socbench/web.env` and `/etc/socbench/worker.env`, run the update script with `--force` on the web host and restart the worker |
| Renew the MATLAB licence (annually) | The Workers page shows the expiry; repeat the interactive sign-in and `matlab-mhlm-setup.sh` |
| Grant administrator rights | Admin → Users → Make admin, or add the address to `ADMIN_EMAILS`; effective on the user's next request; every administrator is e-mailed |
| Credit a model to someone else, or fix its description | Admin → Submissions → Edit authors / Edit details (name, description, links) |
| Record a score from before the platform | Admin → Submissions → Record a legacy score |
| Re-run the security suite after a sandbox change | `python security-tests/<suite>/run.py` in the laboratory's working copy; each exits non-zero when a finding survives |
| Read the server logs | Web host: `journalctl -u socbench-web`, `-u socbench-web-update`, `-u caddy`. Worker: `journalctl -u socbench-worker` (the last 200 lines are on the Workers page) |

