"""Benchmark the evaluator configurations on the reference packages.

    python scripts/bench-evaluators.py --data blind-data/blind_data.mat --out bench-out [--models cc,ekf,fnn,lstm] [--configs A,B,C,D,E,F] [--repeats 1]

Configurations (model language -> scorer):
  A  MATLAB -> Python  (python -m socbench_eval, --runtime matlab)      what runs today
  B  Python -> Python  (python -m socbench_eval)                         what runs today
  C  MATLAB -> MATLAB  (Evaluate_Submission.m, native)
  D  Python -> MATLAB  (Evaluate_Submission.m, Mode=bridge)              py. in-process interface
  E  Python -> MATLAB  (Evaluate_Submission.m, Mode=runner)              one Python subprocess
  F  Python -> MATLAB  (Evaluate_Submission.m, Mode=percycle)            one Python subprocess per matrix

Writes <out>/results.csv, <out>/summary.md and one folder per run with results.json and the log.
Parity is checked against configuration B (or A when B is absent): the 18 metrics and the weighted
error must agree to three decimals for every configuration of the same model.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
EXAMPLES = REPO / "evaluator" / "examples"
MODELS = {"cc": "coulomb-counter", "ekf": "ekf", "fnn": "fnn", "lstm": "lstm"}
METRICS = ["allCells", "blindedCell", "nonBlindedCells", "charging", "massM80", "massM448", "massM448N", "massM1000", "standardCycles", "nonStandardCycles",
           "tempM20", "tempM10", "temp0", "temp10", "temp25", "temp40", "initialSocError", "currentSensorOffset", "weightedError"]
CONFIGS = {
    "A": ("matlab", "python-scorer", None),
    "B": ("python", "python-scorer", None),
    "C": ("matlab", "matlab-scorer", "native"),
    "D": ("python", "matlab-scorer", "bridge"),
    "E": ("python", "matlab-scorer", "runner"),
    "F": ("python", "matlab-scorer", "percycle"),
}


def q(p: Path) -> str:
    return str(p).replace("\\", "/").replace("'", "''")


def run_one(cfg: str, model: str, data: Path, out: Path, matlab: str, python: str) -> dict:
    lang, scorer, mode = CONFIGS[cfg]
    pkg = EXAMPLES / f"{MODELS[model]}.{lang}.zip"
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").unlink(missing_ok=True)
    (out / "error.json").unlink(missing_ok=True)
    env = dict(os.environ, SOCBENCH_PYTHON=python, PYTHONIOENCODING="utf-8")
    if scorer == "python-scorer":
        cmd = [python, "-m", "socbench_eval", str(pkg), str(out), "--data", str(data), "--runtime", lang, "--matlab", matlab]
        env["PYTHONPATH"] = str(REPO / "evaluator" / "python")
    else:
        m = f"addpath('{q(REPO / 'matlab')}'); Evaluate_Submission('{q(pkg)}','{q(data)}','{q(out)}','Mode','{mode}','Python','{q(Path(python))}')"
        cmd = [matlab, "-batch", m]
    t0 = time.perf_counter()
    with open(out / "log.txt", "w", encoding="utf-8") as log:
        log.write(" ".join(cmd) + "\n\n")
        proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, env=env, cwd=str(REPO))
    wall = time.perf_counter() - t0
    row = {"config": cfg, "model": model, "language": lang, "scorer": scorer, "mode": mode or "native", "wallSec": round(wall, 1), "exit": proc.returncode}
    rj = out / "results.json"
    if rj.is_file():
        r = json.loads(rj.read_text(encoding="utf-8"))
        row.update({k: r.get(k) for k in METRICS})
        row["complexity"] = r.get("complexity")
        row["secondsPerSample"] = r.get("secondsPerSample")
        row["elapsedSec"] = r.get("elapsedSec")
        for k, v in (r.get("timing") or {}).items():
            row[f"t_{k}"] = round(float(v), 1)
    else:
        ej = out / "error.json"
        row["error"] = json.loads(ej.read_text(encoding="utf-8")).get("message") if ej.is_file() else "no results.json"
    return row


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="bench-out")
    ap.add_argument("--models", default="cc,ekf,fnn,lstm")
    ap.add_argument("--configs", default="A,B,C,D,E,F")
    ap.add_argument("--repeats", type=int, default=1)
    ap.add_argument("--matlab", default=os.environ.get("MATLAB_BIN", r"C:\Program Files\MATLAB\R2026a\bin\matlab.exe"))
    ap.add_argument("--python", default=sys.executable)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for model in a.models.split(","):
        for cfg in a.configs.split(","):
            for rep in range(a.repeats):
                tag = f"{model}-{cfg}-r{rep + 1}"
                print(f"== {tag}", flush=True)
                row = run_one(cfg, model, Path(a.data), out / tag, a.matlab, a.python)
                row["repeat"] = rep + 1
                rows.append(row)
                print(f"   wall {row['wallSec']} s · exit {row['exit']} · weighted {row.get('weightedError')} · complexity {row.get('complexity')} · {row.get('error', '')}", flush=True)
                write(rows, out)
    print(f"done — {out / 'summary.md'}")


def write(rows: list[dict], out: Path) -> None:
    keys: list[str] = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    with open(out / "results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(rows)
    # parity + summary
    lines = ["# Evaluator benchmark", "", "| model | config | language → scorer | mode | wall s | run s | s/sample | bin | weighted | parity |", "|---|---|---|---|---|---|---|---|---|---|"]
    for model in sorted({r["model"] for r in rows}):
        ref = next((r for r in rows if r["model"] == model and r["config"] == "B" and r.get("weightedError") is not None), None) or \
              next((r for r in rows if r["model"] == model and r["config"] == "A" and r.get("weightedError") is not None), None)
        for r in [x for x in rows if x["model"] == model]:
            if r.get("weightedError") is None:
                parity = f"failed: {str(r.get('error', ''))[:60]}"
            elif ref is None or r is ref:
                parity = "reference"
            else:
                diffs = [k for k in METRICS if ref.get(k) is not None and r.get(k) is not None and abs(float(ref[k]) - float(r[k])) > 0.0015]
                parity = "identical" if not diffs else "DIFFERS: " + ", ".join(diffs)
            sps = r.get("secondsPerSample")
            lines.append(f"| {model} | {r['config']} | {r['language']} → {r['scorer'].replace('-scorer', '')} | {r['mode']} | {r['wallSec']} | {r.get('t_runSec', r.get('elapsedSec', ''))} | {f'{sps:.2e}' if isinstance(sps, (int, float)) else ''} | {r.get('complexity', '')} | {r.get('weightedError', '')} | {parity} |")
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
