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

# Submission packages are untrusted input. Limits mirror src/lib/package-check.ts.
MAX_ENTRIES = 500
MAX_TOTAL_BYTES = 512 * 1024 * 1024
MAX_ENTRY_BYTES = 256 * 1024 * 1024
MAX_RATIO = 200  # uncompressed / compressed — zip bombs are ~1000+


def safe_extract(z: zipfile.ZipFile, dest: Path) -> str | None:
    """Extract only regular files at the top level, refusing traversal, symlinks and bombs. Returns a problem string or None."""
    dest = dest.resolve()
    infos = [i for i in z.infolist() if not i.filename.startswith("__MACOSX/") and not i.filename.endswith(".DS_Store")]
    if len(infos) > MAX_ENTRIES:
        return f"The archive has {len(infos)} entries; at most {MAX_ENTRIES} are allowed."
    total = 0
    for i in infos:
        name = i.filename
        if i.is_dir():
            continue
        if name.startswith(("/", "\\")) or ".." in name.replace("\\", "/").split("/") or ":" in name[:2]:
            return f"Unsafe path in archive: {name!r}."
        if (i.external_attr >> 16) & 0o170000 == 0o120000:  # symlink
            return f"Symbolic links are not allowed in the package ({name!r})."
        if i.file_size > MAX_ENTRY_BYTES:
            return f"{name!r} is larger than {MAX_ENTRY_BYTES // 1048576} MB uncompressed."
        if i.compress_size and i.file_size / max(1, i.compress_size) > MAX_RATIO:
            return f"{name!r} has an implausible compression ratio; the package was rejected."
        total += i.file_size
        if total > MAX_TOTAL_BYTES:
            return f"The package exceeds {MAX_TOTAL_BYTES // 1048576} MB uncompressed."
    for i in infos:
        if i.is_dir():
            continue
        target = (dest / Path(i.filename.replace("\\", "/")).name).resolve()  # flatten: top-level files only
        if target.parent != dest:
            return f"Unsafe path in archive: {i.filename!r}."
        with z.open(i) as src, open(target, "wb") as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
    return None
from .pipeline import build_jobs, complexity, display_indices, per_cycle_rows, robustness_traces, score, validation_job, write_full_traces
from .runner import MatlabBackend, ModelError, PythonBackend


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


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
    ap.add_argument("--dry-run", action="store_true", help="validate + one OPEN-data cycle; no blinded data, no scores")
    args = ap.parse_args(argv)

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "error.json").unlink(missing_ok=True)
    if args.dry_run:
        args.data = str(Path(__file__).resolve().parents[1] / "dryrun_data.mat")   # open data, ships with the repo
    if not args.data or not Path(args.data).is_file():
        fail(out, "CONFIG", "SOCBENCH_BLIND_DATA (or --data) must point to blind_data.mat.")
    calibration = {"python": float(os.environ.get("SOCBENCH_CAL_PYTHON", "9.2e-7")), "matlab": float(os.environ.get("SOCBENCH_CAL_MATLAB", "3.5e-8"))}

    t0 = time.perf_counter()
    work = Path(tempfile.mkdtemp(prefix="socbench-pkg-"))
    try:
        try:
            with zipfile.ZipFile(args.package) as z:
                problem = safe_extract(z, work)
                if problem:
                    fail(out, "FORMAT", problem)
        except zipfile.BadZipFile:
            fail(out, "FORMAT", "The package is not a valid .zip archive.")
        has_py, has_m = (work / "Model.py").is_file(), ((work / "Model.m").is_file() or (work / "Model.p").is_file())
        runtime = args.runtime
        if runtime == "auto":
            runtime = "python" if has_py else "matlab" if has_m else ""
        if not runtime:
            fail(out, "FORMAT", "No Model.py, Model.m or Model.p at the top level of the archive.")

        log(f"runtime: {runtime}")
        try:
            backend = PythonBackend(work) if runtime == "python" else MatlabBackend(work, args.matlab, args.timeout_min)
        except ModelError as e:
            fail(out, "FORMAT", str(e))

        if args.dry_run:
            dry_run(args, out, backend, runtime, calibration, t0)
            return

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
        traces += robustness_traces(data, preds)  # key robustness cases (wrong initial SOC, sensor offset)
        result = {
            "evaluatorVersion": f"socbench-eval-{__version__}/{runtime}",
            "runtime": runtime,
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
        try:
            nbytes = write_full_traces(out, data, preds, per_cell)
            log(f"full-resolution traces written ({nbytes // 1024} KB, traces.mat)")
        except Exception as e:  # noqa: BLE001 — the download is a convenience, never fail a scored run for it
            log(f"could not write full-resolution traces: {type(e).__name__}: {e}")
        log(f"done in {result['elapsedSec']} s — weighted error {s['weightedError']:.3f}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def dry_run(args, out: Path, backend, runtime: str, calibration: dict, t0: float) -> None:
    """Pre-submission check on OPEN data: does the package run, what error does it make on
    one public cycle, how expensive is it. Mirrors the real pipeline (offset validation, then
    a padded cycle) so a package that passes here will run on the blinded data."""
    from .pipeline import rmse
    from .runner import Job, PAD_SAMPLES, build_input

    data = load_blind_data(args.data, require_all=False)
    cyc = data.cells["m80"][0]
    log(f"dry run on open data: m80 {cyc.name} @ {cyc.temp_c:g}C, {len(cyc.SOC)} samples")
    X1 = cyc.X(); X1[:, 0] += 0.3
    try:
        backend.run([Job("validation", __import__("numpy").vstack([__import__("numpy").repeat(X1[:1], 60, axis=0), X1]), 60)], log)
    except ModelError as e:
        fail(out, "VALIDATION", f"The model raised an error during the validation run (+0.3 A offset): {e}")
    try:
        p = backend.run([Job("cycle", build_input(cyc.X()), PAD_SAMPLES)], log)[0]
    except ModelError as e:
        fail(out, "RUNTIME", str(e))
    import numpy as np
    a = cyc.SOC
    t_sample = p.secs / p.n_samples
    ratio, cat, step = t_sample / calibration[runtime], 1, 10 ** (1 / 3)
    while ratio > step:
        ratio /= step; cat += 1
    idx = display_indices(a, p.soc)  # peak-preserving down-sampling: the plot agrees with maxErr
    result = {
        "dryRun": True, "runtime": runtime,
        "cycle": {"cell": "m80", "cycle": cyc.name, "temperatureC": cyc.temp_c, "samples": int(len(a))},
        "rmse": round(rmse(a, p.soc), 3), "mae": round(float(100 * np.mean(np.abs(a - p.soc))), 3), "maxErr": round(float(100 * np.max(np.abs(a - p.soc))), 3),
        "secondsPerSample": t_sample, "complexity": max(1, min(10, cat)),
        "trace": {"t": [round(float(i) / 3600, 3) for i in idx], "actual": [round(float(100 * a[i]), 2) for i in idx], "estimated": [round(float(100 * p.soc[i]), 2) for i in idx]},
        "elapsedSec": round(time.perf_counter() - t0),
    }
    (out / "results.json").write_text(json.dumps(result), encoding="utf-8")
    log(f"dry run OK in {result['elapsedSec']} s — RMSE {result['rmse']:.3f} % on open data")


if __name__ == "__main__":
    main()
