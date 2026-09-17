"""Python model runner for the MATLAB evaluator (configuration E / F).

    python socbench_runner.py <package dir> <in.mat> <out.mat>

in.mat  : X   cell array of N_k x 3 matrices [Current, Voltage, Temperature] (already padded / offset by the scorer)
out.mat : preds cell array of N_k x 1 SOC estimates, secs(k) wall time per matrix, err ('' on success)

Mirrors matlab/Run_Model.m exactly, in the other direction: imports Model.py once, iterates
Model(X[i], z) per sample, times each matrix. Contains no scoring logic.
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

import numpy as np
from scipy.io import loadmat, savemat


def load_model(pkg_dir: Path):
    model_file = pkg_dir / "Model.py"
    if not model_file.is_file():
        raise RuntimeError("Model.py not found at the top level of the package.")
    if str(pkg_dir) not in sys.path:
        sys.path.insert(0, str(pkg_dir))
    spec = importlib.util.spec_from_file_location("submitted_model", model_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not callable(getattr(mod, "Model", None)):
        raise RuntimeError("Model.py must define a callable named Model(X, z).")
    return mod


def scalar(y) -> float:
    a = np.asarray(y, dtype=float).reshape(-1)
    if a.size != 1:
        raise RuntimeError("Model must return exactly one SOC value per sample.")
    v = float(a[0])
    if not np.isfinite(v):
        raise RuntimeError("Model returned NaN or Inf.")
    return v


def iterate(model, X: np.ndarray) -> np.ndarray:
    n = X.shape[0]
    out = np.zeros(n)
    y, z = model.Model(X[0, :].copy())
    out[0] = scalar(y)
    for i in range(1, n):
        y, z = model.Model(X[i, :].copy(), z)
        out[i] = scalar(y)
    return out


def main(pkg_dir: str, in_file: str, out_file: str) -> int:
    err = ""
    preds: list[np.ndarray] = []
    secs: list[float] = []
    try:
        model = load_model(Path(pkg_dir))
        m = loadmat(in_file, squeeze_me=False)
        X = m["X"].reshape(-1)
        n = len(X)
        for k in range(n):
            Xk = np.asarray(X[k], dtype=float)
            t0 = time.perf_counter()
            y = iterate(model, Xk)
            secs.append(time.perf_counter() - t0)
            preds.append(y.reshape(-1, 1))
            print(f"[socbench_runner] {k + 1}/{n} done in {secs[-1]:.1f} s ({Xk.shape[0]} samples)", flush=True)
    except Exception as e:  # noqa: BLE001 — reported to MATLAB through out.mat, like Run_Model.m
        err = f"{type(e).__name__}: {e}"
        print(f"[socbench_runner] ERROR: {err}", file=sys.stderr, flush=True)
    cell = np.empty(len(preds), dtype=object)
    for i, p in enumerate(preds):
        cell[i] = p
    savemat(out_file, {"preds": cell.reshape(-1, 1), "secs": np.array(secs, dtype=float).reshape(-1, 1), "err": err}, do_compression=False)
    return 1 if err else 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
