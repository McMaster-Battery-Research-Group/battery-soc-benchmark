## 13. ❓ Questions you will probably get

### 👤 From researchers and non-developers

**"Is my model safe with you?"** It is deleted the moment it has been scored. What remains is the scores, the down-sampled traces on your results page, and the full-resolution traces file you can download. Nobody at the lab opens packages; the worker is the only thing that reads them.

**"Can other people see my model or my results?"** Never your model. Your results are public if you submit publicly; if you tick *private*, only you, your collaborators and administrators can see them, and you get a ghost rank showing where you would stand.

**"Why only three submissions a day?"** A full evaluation occupies a machine for up to an hour. The dry run is free and unlimited within reason (five an hour) — use it to iterate, and submit when you are confident.

**"What does the complexity number mean for me?"** Roughly, would this fit on a real battery controller? A 2 is a few arithmetic operations per second; a 9 is a neural network that would need a much bigger processor. It never affects your rank.

**"Why is the blinded cell separate?"** `m448` is the one cell no data was ever published for. A model that does well on the other three but badly on it has probably memorised the open data rather than learned the physics. That gap is the first thing the plain-English insights point at.

**"Why does my score differ from the number in the paper?"** The paper reports all-cells RMSE; the leaderboard ranks on weighted error, which up-weights the hard cases (cold, heavy load, robustness). Both are on your results page.

**"Why do I have to click a button in the verification e-mail?"** Corporate mail scanners open every link before you do; the button stops them activating your account on your behalf.

### 💻 From developers

**"How do you stop someone's model from stealing the blinded data?"** It can read it — it has to, to be evaluated — but it cannot send it anywhere: no network in the container, read-only filesystem, no secrets in the environment, container destroyed afterwards. And it cannot reach the website or the database at all; those are on a different machine.

**"What if two workers grab the same job?"** They cannot. Claiming is an `UPDATE … WHERE lockedAt = <what I just read>`; exactly one worker sees one row updated. No transactions, no advisory locks — a compare-and-swap on one column.

**"What if a worker dies mid-evaluation?"** Its lock stops being refreshed (every log line refreshes it). After 30 quiet minutes another worker can reclaim the job; there are two attempts per job. A graceful stop hands the job back immediately without consuming an attempt.

**"Why Python for the maths when the lab's tool was MATLAB?"** Numerically identical — verified to 0.000 against the historical leaderboard — much faster, no licence needed to *score*, and it runs anywhere. MATLAB is kept only to execute `.m/.p` models: 40 lines that do nothing else.

**"Why is there no REST API?"** Pages read the database directly in Server Components; forms call Server Actions. Route handlers exist only where a URL is genuinely needed: status polling, downloads, upload URLs, the health check.

**"Are Python and MATLAB submissions scored the same?"** Accuracy: identical — same data, same scoring code, models called one sample at a time in both. Complexity: calibrated per runtime, informational only, never enters the weighted error.

**"What happens if you change the grading?"** Weights only: an admin changes them, every stored result is re-scored from its 18 stored values, authors are e-mailed. Anything deeper: bump the benchmark version; old results become "legacy · unranked" and authors resubmit, because packages are deleted after evaluation on purpose.

**"How do you know the worker is alive?"** It writes a heartbeat row every 15 s with diagnostics and its console tail; the Workers page shows it. A GitHub Action polls a health endpoint every 10 minutes and e-mails admins on the transition to "no heartbeat for 3 min" and back.

**"Why does the browser upload straight to the bucket?"** Vercel's 4.5 MB body cap. Signed URL, ~2 h validity; the server re-downloads and validates before creating anything.

**"Why run a validation cycle first?"** So a broken model fails in seconds with the real error instead of after 45 minutes.

**"Where is the per-sample loop?"** `_iterate_py` in `runner.py` for Python; the `for i = 2:size(X,1)` loop in `Run_Model.m` for MATLAB. Both carry `z` forward and call once per sample — the BMS contract.

**"Why is the queue a database table and not Redis?"** One fewer service to run and pay for, and the compare-and-swap gives the same guarantee. Throughput is a few jobs an hour; a queue service would be solving a problem we do not have.

**"Why serverless for the website but a VM for the worker?"** The website is bursty and stateless — serverless is free and scales itself. The worker needs the blinded data on disk, Docker, MATLAB and multi-hour runs — none of which serverless allows.

**"Why `after()` everywhere in server actions?"** Vercel freezes the function the instant it returns; an un-awaited promise is dropped. `after()` keeps the function alive until the background work finishes. This is written down because it silently lost admin e-mails once.

**Rough edges to know about before someone finds them:** `.env.example` defines `ADMIN_NOTIFY_EMAIL` and `MAIL_FROM` twice and omits `WORKER_RUNTIMES`; the Workers page (60 s) and the health endpoint (3 min) use different "online" windows on purpose; complexity bins for loop-heavy MATLAB code can drift ±1 between hosts; the leaderboard tie-break was only made explicit on 11 September (all-cells RMSE, then earlier submission).

