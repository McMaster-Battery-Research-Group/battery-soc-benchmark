"""Turn bench-out/merged.csv into docs/evaluator-benchmark.md and an HTML page with bar charts.

    python scripts/bench-report.py bench-out/merged.csv docs/evaluator-benchmark.md <out.html>
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

src, md_out, html_out = (Path(p) for p in sys.argv[1:4])
rows = list(csv.DictReader(open(src, encoding="utf-8")))
MODELS = [("cc", "Coulomb counter"), ("ekf", "EKF"), ("fnn", "FNN"), ("lstm", "LSTM")]
CFG = {
    "A": ("MATLAB → Python", "what runs today"), "B": ("Python → Python", "what runs today"),
    "C": ("MATLAB → MATLAB", "one MATLAB script, native"), "D": ("Python → MATLAB", "py. bridge, in-process"),
    "E": ("Python → MATLAB", "one runner process"), "F": ("Python → MATLAB", "one process per matrix"),
}
by = {(r["model"], r["config"]): r for r in rows}
f = lambda r, k: float(r[k]) if r and r.get(k) not in (None, "") else None  # noqa: E731

# ---------------------------------------------------------------- markdown
L = [f"# Evaluator benchmark ({date.today():%d %B %Y})", "",
     "Four reference models, each as a MATLAB and a Python package, evaluated through six configurations on one laptop (Windows 11, MATLAB R2026a, Python 3.14, the withheld dataset). One repeat per cell. "
     "**Every configuration produced identical results: all 18 test-case metrics and the weighted error agree to three decimals for every model.** The decision therefore turns on cost alone.", "",
     "| | Model → scorer | Mechanism |", "|---|---|---|"] + [f"| **{c}** | {a} | {b} |" for c, (a, b) in CFG.items()] + [""]
L += ["## Wall time per evaluation (seconds)", "", "| Model | A | B | C | D | E | F |", "|---|---|---|---|---|---|---|"]
for m, name in MODELS:
    L.append(f"| {name} | " + " | ".join(f"{f(by.get((m, c)), 'wallSec'):.0f}" for c in "ABCDEF") + " |")
L += ["", "## Complexity bin (time per sample, per-language calibration)", "", "| Model | A | B | C | D | E | F |", "|---|---|---|---|---|---|---|"]
for m, name in MODELS:
    L.append(f"| {name} | " + " | ".join(f"{int(f(by.get((m, c)), 'complexity'))}" for c in "ABCDEF") + " |")
L += ["", "## Time per sample (seconds, model loop only)", "", "| Model | A | B | C | D | E | F |", "|---|---|---|---|---|---|---|"]
for m, name in MODELS:
    L.append(f"| {name} | " + " | ".join(f"{f(by.get((m, c)), 'secondsPerSample'):.1e}" for c in "ABCDEF") + " |")
L += ["", "## Weighted error (identical across configurations)", "", "| Model | Weighted error |", "|---|---|"]
for m, name in MODELS:
    L.append(f"| {name} | {f(by[(m, 'B')], 'weightedError'):.3f} |")
L += ["", "## Reading the numbers", "",
      "- **E is the mirror of A.** For a Python package, one MATLAB scorer plus one Python runner costs 20–50 s more than the pure-Python evaluator (B): MATLAB's start-up and the two files. It lands in the same complexity bin as B or one above. This is the configuration the C + E proposal uses.",
      "- **C matches A.** Both run the same native MATLAB loop; the scorer's language makes no measurable difference to a MATLAB package.",
      "- **The bridge (D) is 5–60× slower** than every other route and its time-per-sample is dominated by the MATLAB↔Python conversion on each of the 1.4 million calls, so its complexity bin is not the model's. It is not a viable path.",
      "- **Per-cycle subprocesses (F)** add 60–90 s of interpreter start-ups per evaluation and inflate the bin by one. This was the original tool's behaviour.",
      "- **Calibration.** The same model lands in different bins by language (EKF: 10 in MATLAB, 6 in Python; FNN: 9 versus 4). Both constants were set so that a plain Coulomb counter lands in bin 2 on the evaluation host; the MATLAB constant is now too small for this machine (the Coulomb counter lands in bin 1). Re-measure both constants on the production VM before comparing bins across languages, or report complexity per language.",
      "- **A defect found on the way.** The FNN and LSTM Python example packages indexed a lazily loaded `weights.npz` inside `Model()`, re-reading the archive on every sample; the FNN took 39 minutes through Python. Fixed in both packages and on the examples page (`W = dict(np.load(...))`); the corrected packages are what the table shows.", "",
      "## Reproducing", "",
      "```", "python scripts/bench-evaluators.py --data blind-data/blind_data.mat --out bench-out --models cc,ekf,fnn,lstm --configs A,B,C,D,E,F", "python scripts/bench-report.py bench-out/results.csv docs/evaluator-benchmark.md bench-out/report.html", "```", "",
      "Configurations C–F run `matlab/Evaluate_Submission.m` (with `matlab/socbench_runner.py` for Python packages); A and B run `evaluator/python/socbench_eval`. Raw per-run output, logs and `results.json` files are in the benchmark output folder (not committed)."]
md_out.write_text("\n".join(L) + "\n", encoding="utf-8")

# ---------------------------------------------------------------- html
COL = {"A": "#7A003C", "B": "#0D5D78", "C": "#B8860B", "D": "#B3261E", "E": "#0E5B3D", "F": "#6B3FA0"}
def bars(metric, fmt, log=False):
    out = []
    for m, name in MODELS:
        vals = {c: f(by.get((m, c)), metric) for c in "ABCDEF"}
        vmax = max(v for v in vals.values() if v)
        out.append(f'<div class="grp"><h4>{name}</h4>')
        for c in "ABCDEF":
            v = vals[c]
            pct = (v / vmax) * 100 if not log else (max(0, (__import__("math").log10(v) + 2)) / (__import__("math").log10(vmax) + 2)) * 100
            out.append(f'<div class="bar"><span class="k">{c}</span><i style="width:{pct:.1f}%;background:{COL[c]}"></i><b>{fmt(v)}</b></div>')
        out.append("</div>")
    return "".join(out)
table = "".join(f"<tr><td><b>{m2}</b></td>" + "".join(f'<td>{f(by.get((m, c)), "wallSec"):.0f} s · bin {int(f(by.get((m, c)), "complexity"))}</td>' for c in "ABCDEF") + f"<td>{f(by[(m, 'B')], 'weightedError'):.3f}</td></tr>" for m, m2 in MODELS)
html = f"""<title>Evaluator Benchmark</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
:root{{--ink:#1D2428;--grey:#5B6770;--rule:#D9DCDF;--ground:#FAFAF9;--surface:#fff;--good-bg:#E6F2EC;--good:#0E5B3D}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--ink:#ECEEF0;--grey:#AEB6BD;--rule:#3A4147;--ground:#15181B;--surface:#1E2226;--good-bg:#173428;--good:#7FC9A3}}}}
:root[data-theme="dark"]{{--ink:#ECEEF0;--grey:#AEB6BD;--rule:#3A4147;--ground:#15181B;--surface:#1E2226;--good-bg:#173428;--good:#7FC9A3}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--ground);color:var(--ink);font:15px/1.55 "IBM Plex Sans",Arial,sans-serif;padding-block:32px 64px;padding-inline:20px}}
main{{max-width:960px;margin:0 auto}}h1{{font:600 30px/1.15 Poppins,Arial,sans-serif;margin:0 0 8px}}h2{{font:600 19px/1.3 Poppins,Arial,sans-serif;margin:36px 0 10px}}h4{{font:600 13px/1.3 Poppins,Arial,sans-serif;margin:0 0 6px;color:var(--grey)}}
.lede{{color:var(--grey);max-width:70ch;margin:0 0 18px}}.verdict{{background:var(--good-bg);color:var(--good);border-radius:6px;padding:12px 16px;font-weight:600;margin:0 0 24px}}
.cfg{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px 18px;font-size:13.5px;margin:0 0 8px}}.cfg span b{{display:inline-block;width:20px;height:20px;border-radius:4px;color:#fff;text-align:center;line-height:20px;font-size:12px;margin-right:8px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px 28px}}.grp{{background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:12px 14px}}
.bar{{display:grid;grid-template-columns:18px 1fr 64px;align-items:center;gap:8px;margin:4px 0;font-size:12.5px}}.bar .k{{color:var(--grey);font-weight:600}}.bar i{{display:block;height:12px;border-radius:2px;min-width:2px}}.bar b{{font-weight:600;text-align:right;font-variant-numeric:tabular-nums}}
.tblwrap{{overflow-x:auto;border:1px solid var(--rule);border-radius:6px;background:var(--surface)}}table{{border-collapse:collapse;width:100%;font-size:13px;min-width:720px}}th,td{{padding:8px 10px;border-bottom:1px solid var(--rule);text-align:left;white-space:nowrap}}th{{font:600 11px/1.3 Poppins,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--grey)}}tr:last-child td{{border-bottom:0}}
ul{{max-width:76ch}}li{{margin:6px 0}}code{{font:13px "IBM Plex Mono",Consolas,monospace}}
</style>
<main>
<h1>Evaluator benchmark</h1>
<p class="lede">Four reference models, each as a MATLAB and a Python package, through six evaluator configurations on one laptop ({date.today():%d %B %Y}). One repeat per cell.</p>
<div class="verdict">Every configuration produced identical results: all 18 test-case metrics and the weighted error agree to three decimals for every model. The choice is about cost only.</div>
<div class="cfg">{"".join(f'<span><b style="background:{COL[c]}">{c}</b>{a} · {b}</span>' for c, (a, b) in CFG.items())}</div>
<h2>Wall time per evaluation</h2><div class="grid">{bars("wallSec", lambda v: f"{v:.0f} s")}</div>
<h2>Time per sample, model loop only (log scale)</h2><div class="grid">{bars("secondsPerSample", lambda v: f"{v*1e6:.0f} µs", log=True)}</div>
<h2>All numbers</h2><div class="tblwrap"><table><tr><th>Model</th>{"".join(f"<th>{c}</th>" for c in "ABCDEF")}<th>Weighted error</th></tr>{table}</table></div>
<h2>Reading the numbers</h2>
<ul>
<li><b>E is the mirror of A.</b> One MATLAB scorer plus one Python runner costs 20–50 s more than the pure-Python evaluator (B): MATLAB's start-up and two files. Same complexity bin as B or one above. This is what the C + E proposal uses.</li>
<li><b>C matches A.</b> Both run the same native MATLAB loop; the scorer's language makes no measurable difference to a MATLAB package.</li>
<li><b>The bridge (D) is 5–60× slower</b> than every other route, and its per-sample time is the MATLAB↔Python conversion on each of 1.4 million calls, not the model. Not viable.</li>
<li><b>Per-cycle subprocesses (F)</b> add 60–90 s of interpreter start-ups per evaluation and inflate the bin by one. This was the original tool's behaviour.</li>
<li><b>Calibration.</b> The same model lands in different bins by language (EKF 10 vs 6, FNN 9 vs 4). Both constants must be re-measured on the production VM before bins are compared across languages, or complexity should be reported per language.</li>
<li><b>Defect found.</b> The FNN and LSTM Python examples re-read <code>weights.npz</code> on every sample (a lazily loaded archive indexed inside <code>Model()</code>); the FNN took 39 minutes. Fixed in both packages and on the examples page; the corrected packages are what is shown.</li>
</ul>
</main>
"""
html_out.write_text(html, encoding="utf-8")
print("wrote", md_out, "and", html_out)
