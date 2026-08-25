"""CLI:  python -m socbench_eval <package.zip> <outDir> --data <blind_data.mat> [--runtime auto|python|matlab]

Writes <outDir>/results.json on success, <outDir>/error.json + exit 1 on failure.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from . import __version__
from .data import load_blind_data
from .pipeline import build_jobs, complexity, per_cycle_rows, score, validation_job
from .runner import MatlabBackend, ModelError, PythonBackend


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def read_settings(pkg: Path) -> dict:
    try:
        import openpyxl  # optional

        ws = openpyxl.load_workbook(pkg / "Settings.xlsx", read_only=True).worksheets[0]
        cell = lambda r: str(ws.cell(row=r, column=2).value or "")  # noqa: E731
        return {"authorName": cell(1), "affiliation": cell(2), "email": cell(3), "modelName": cell(4)}
    except Exception:  # noqa: BLE001
        return {}


def fail(out: Path, code: str, message: str) -> None:
    (out / "error.json").write_text(json.dumps({"code": code, "message": message}), encoding="utf-8")
    print(f"EVALUATION FAILED [{code}]: {message}", file=sys.stderr, flush=True)
    sys.exit(1)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="socbench_eval")
    ap.add_argument("package")
    ap.add_argument("out_dir")
    ap.add_argument("--data", default=os.environ.get("SOCBENCH_BLIND_DATA"), help="blind_data.mat (matlab/Export_Blind_Data.m)")
    ap.add_argument("--runtime", default=os.environ.get("SOCBENCH_RUNTIME", "auto"), choices=["auto", "python", "matlab"])
    ap.add_argument("--matlab", default=os.environ.get("MATLAB_BIN", "matlab"))
    ap.add_argument("--timeout-min", type=float, default=float(os.environ.get("SOCBENCH_TIMEOUT_MIN", "180")))
    args = ap.parse_args(argv)

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "error.json").unlink(missing_ok=True)
    if not args.data or not Path(args.data).is_file():
        fail(out, "CONFIG", "SOCBENCH_BLIND_DATA (or --data) must point to blind_data.mat.")
    calibration = {"python": float(os.environ.get("SOCBENCH_CAL_PYTHON", "9.2e-7")), "matlab": float(os.environ.get("SOCBENCH_CAL_MATLAB", "3.5e-8"))}

    t0 = time.perf_counter()
    work = Path(tempfile.mkdtemp(prefix="socbench-pkg-"))
    try:
        try:
            with zipfile.ZipFile(args.package) as z:
                z.extractall(work)
        except zipfile.BadZipFile:
            fail(out, "FORMAT", "The package is not a valid .zip archive.")
        has_py, has_m = (work / "Model.py").is_file(), ((work / "Model.m").is_file() or (work / "Model.p").is_file())
        runtime = args.runtime
        if runtime == "auto":
            runtime = "python" if has_py else "matlab" if has_m else ""
        if not runtime:
            fail(out, "FORMAT", "No Model.py, Model.m or Model.p at the top level of the archive.")
        settings = read_settings(work)

        log(f"runtime: {runtime}")
        try:
            backend = PythonBackend(work) if runtime == "python" else MatlabBackend(work, args.matlab, args.timeout_min)
        except ModelError as e:
            fail(out, "FORMAT", str(e))

        log("loading blinded data")
        data = load_blind_data(args.data)

        log("validation: m80 UDDS @ 10C, +0.3 A")
        try:
            backend.run([validation_job(data)], log)
        except ModelError as e:
            fail(out, "VALIDATION", f"The model raised an error during the validation run (10 C UDDS, +0.3 A offset): {e}")

        jobs = build_jobs(data)
        log(f"running {len(jobs)} input matrices (blinded cycles + robustness sweeps)")
        try:
            preds = {p.key: p for p in backend.run(jobs, log)}
        except ModelError as e:
            fail(out, "RUNTIME", str(e))

        s, per_cell, detail = score(data, preds)
        cat, t_sample = complexity(preds, runtime, calibration)
        rows, traces = per_cycle_rows(per_cell)
        result = {
            "evaluatorVersion": f"socbench-eval-{__version__}/{runtime}",
            "runtime": runtime,
            "settings": settings,
            **s,
            "complexity": cat,
            "complexityUncertainty": 1,
            "complexityRaw": f"{cat - 1},{cat},{cat + 1}",
            "secondsPerSample": t_sample,
            "robustness": detail,
            "perCycle": rows,
            "timeSeries": traces,
            "elapsedSec": round(time.perf_counter() - t0),
        }
        (out / "results.json").write_text(json.dumps(result), encoding="utf-8")
        log(f"done in {result['elapsedSec']} s — weighted error {s['weightedError']:.3f}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
