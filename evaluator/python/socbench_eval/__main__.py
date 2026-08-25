"""CLI:  python -m socbench_eval <package.zip> <outDir> --data <blind_data.mat>

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

import numpy as np

from . import __version__
from .data import load_blind_data
from .pipeline import complexity_category, per_cycle_rows, robustness, run_all_cycles, score
from .runner import ModelError, load_model, predict_soc


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def read_settings(pkg: Path) -> dict:
    try:
        import openpyxl  # optional

        wb = openpyxl.load_workbook(pkg / "Settings.xlsx", read_only=True)
        ws = wb.worksheets[0]
        cell = lambda r: (ws.cell(row=r, column=2).value or "")  # noqa: E731
        return {"authorName": str(cell(1)), "affiliation": str(cell(2)), "email": str(cell(3)), "modelName": str(cell(4))}
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
    ap.add_argument("--data", default=os.environ.get("SOCBENCH_BLIND_DATA"), help="blind_data.mat from Export_Blind_Data.m")
    ap.add_argument("--complexity-scale", type=float, default=float(os.environ.get("SOCBENCH_COMPLEXITY_SCALE", "1.0")))
    args = ap.parse_args(argv)

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "error.json").unlink(missing_ok=True)
    if not args.data or not Path(args.data).is_file():
        fail(out, "CONFIG", "SOCBENCH_BLIND_DATA (or --data) must point to blind_data.mat.")

    t0 = time.perf_counter()
    work = Path(tempfile.mkdtemp(prefix="socbench-pkg-"))
    try:
        try:
            with zipfile.ZipFile(args.package) as z:
                z.extractall(work)
        except zipfile.BadZipFile:
            fail(out, "FORMAT", "The package is not a valid .zip archive.")
        if not (work / "Model.py").is_file():
            fail(out, "FORMAT", "No Model.py at the top level of the archive (use the MATLAB evaluator for Model.m/.p).")
        settings = read_settings(work)

        log("loading blinded data")
        data = load_blind_data(args.data)

        log("importing Model.py")
        try:
            model = load_model(work)
        except ModelError as e:
            fail(out, "FORMAT", str(e))

        # Validation identical to Validate_Submission.m: m80 UDDS @ 10 C with +0.3 A offset, 1 minute pad
        log("validating on m80 UDDS @ 10C with +0.3 A offset")
        vcyc = next(c for c in data.cells["m80"] if c.name.startswith("UDDS") and c.temp_c == 10 and c.is_test)
        X1 = vcyc.X().copy()
        X1[:, 0] += 0.3
        Xv = np.vstack([np.repeat(X1[:1], 60, axis=0), X1])
        try:
            from .runner import iterate

            iterate(model, Xv)
        except ModelError as e:
            fail(out, "VALIDATION", f"The model raised an error during the validation run (10 C UDDS, +0.3 A offset): {e}")

        log("running all blinded cycles")
        try:
            ev = run_all_cycles(model, data, log)
            mean_temp, isoc, sens = robustness(model, data, ev, log)
        except ModelError as e:
            fail(out, "RUNTIME", str(e))

        s = score(ev, mean_temp, isoc, sens)
        cat = complexity_category(ev.complexity_score, args.complexity_scale)
        rows, traces = per_cycle_rows(ev)
        result = {
            "evaluatorVersion": f"python-set-{__version__}",
            "settings": settings,
            **s,
            "complexity": int(cat),
            "complexityUncertainty": 1,
            "complexityRaw": f"{cat - 1},{cat},{cat + 1}",
            "complexityScore": ev.complexity_score,
            "robustness": {"initialSocRmse": [round(float(v), 3) for v in isoc], "currentOffsetRmse": [round(float(v), 3) for v in sens]},
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
