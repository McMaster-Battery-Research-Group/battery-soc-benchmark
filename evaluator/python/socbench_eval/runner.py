"""Model execution backends.

The evaluator prepares every input matrix up front (padding, offsets, initial-SOC
restarts), hands the whole batch to a backend, and scores the predictions. Two
backends implement the same interface:

  PythonBackend  imports Model.py and iterates Model(X[i], z) in-process
  MatlabBackend  writes the batch to a .mat, runs matlab/Run_Model.m once, reads
                 the predictions back — MATLAB does nothing but execute the model
"""
from __future__ import annotations

import importlib.util
import os
import traceback
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Callable

import numpy as np
from scipy.io import loadmat, savemat

PAD_SAMPLES = 3600  # one hour of constant data prepended to every cycle (as in the original tool)


class ModelError(RuntimeError):
    """Raised when the submitted model misbehaves; message is shown to the submitter."""


@dataclass
class Job:
    key: str
    X: np.ndarray  # padded N x 3 [I, V, T]
    pad: int


@dataclass
class Prediction:
    key: str
    soc: np.ndarray  # padding removed, NaN -> 0
    secs: float
    n_samples: int  # including padding (for time-per-sample)


def build_input(cycle_X: np.ndarray, offset: float = 0.0, isoc_idx: int = 0) -> np.ndarray:
    """Port of the input preparation in Predict_SOC.m.
    offset:   constant added to the current column.
    isoc_idx: 0-based start index for the initial-SOC test; then the padded
              current is zero (MATLAB: zeros(3600,1)) instead of the first sample.
    """
    X1 = cycle_X[isoc_idx:, :].copy()
    X1[:, 0] += offset
    pad = np.repeat(X1[:1, :], PAD_SAMPLES, axis=0)
    if isoc_idx > 0:
        pad[:, 0] = 0.0
    return np.vstack([pad, X1])


def _finish(key: str, raw: np.ndarray, pad: int, secs: float) -> Prediction:
    soc = np.asarray(raw, dtype=float).reshape(-1)[pad:]
    soc = np.where(np.isnan(soc), 0.0, soc)
    return Prediction(key, soc, secs, int(raw.size))


class Backend:
    name = "?"

    def run(self, jobs: list[Job], log: Callable[[str], None]) -> list[Prediction]:  # pragma: no cover - interface
        raise NotImplementedError


# ---------------------------------------------------------------- Python

class PythonBackend(Backend):
    name = "python"

    def __init__(self, pkg_dir: Path):
        self.model = _load_py_model(pkg_dir)

    def run(self, jobs: list[Job], log: Callable[[str], None]) -> list[Prediction]:
        out = []
        for i, j in enumerate(jobs):
            log(f"{100 * (i + 1) / len(jobs):5.1f}% | {j.key}")
            t0 = time.perf_counter()
            raw = _iterate_py(self.model, j.X)
            out.append(_finish(j.key, raw, j.pad, time.perf_counter() - t0))
        return out


def _load_py_model(pkg_dir: Path) -> ModuleType:
    model_file = pkg_dir / "Model.py"
    if not model_file.is_file():
        raise ModelError("Model.py not found at the top level of the package.")
    if str(pkg_dir) not in sys.path:
        sys.path.insert(0, str(pkg_dir))
    spec = importlib.util.spec_from_file_location("submitted_model", model_file)
    if spec is None or spec.loader is None:
        raise ModelError("Could not import Model.py.")
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception as e:  # noqa: BLE001
        raise ModelError(f"Model.py failed to import: {type(e).__name__}: {e}\n{_user_frames()}") from e
    if not callable(getattr(mod, "Model", None)):
        raise ModelError("Model.py must define a callable named Model(X, z).")
    return mod


def _scalar(y) -> float:
    a = np.asarray(y, dtype=float).reshape(-1)
    if a.size != 1:
        raise ModelError("Model must return exactly one SOC value per sample.")
    v = float(a[0])
    if not np.isfinite(v):
        raise ModelError("Model returned NaN or Inf.")
    return v


def _iterate_py(model: ModuleType, X: np.ndarray) -> np.ndarray:
    n = X.shape[0]
    out = np.zeros(n)
    try:
        res = model.Model(X[0, :].copy())
        if not (isinstance(res, tuple) and len(res) == 2):
            raise ModelError("Model must return a tuple (Y_est, z).")
        y, z = res
        out[0] = _scalar(y)
        for i in range(1, n):
            res = model.Model(X[i, :].copy(), z)
            if not (isinstance(res, tuple) and len(res) == 2):
                raise ModelError("Model must return a tuple (Y_est, z).")
            y, z = res
            out[i] = _scalar(y)
    except ModelError:
        raise
    except Exception as e:  # noqa: BLE001
        raise ModelError(f"Model raised {type(e).__name__}: {e}\n{_user_frames()}") from e
    return out


def _user_frames(limit: int = 6) -> str:
    """Traceback frames from the submitted code only (evaluator internals filtered out)."""
    frames = [f for f in traceback.extract_tb(sys.exc_info()[2]) if "socbench_eval" not in f.filename.replace("\\", "/")]
    lines = [f'  File "{Path(f.filename).name}", line {f.lineno}, in {f.name}\n    {f.line}' for f in frames[-limit:]]
    return "Traceback (most recent call last):\n" + "\n".join(lines) if lines else ""


# ---------------------------------------------------------------- MATLAB

class MatlabBackend(Backend):
    name = "matlab"

    def __init__(self, pkg_dir: Path, matlab_bin: str | None = None, timeout_min: float = 180):
        if not ((pkg_dir / "Model.m").is_file() or (pkg_dir / "Model.p").is_file()):
            raise ModelError("Model.m or Model.p not found at the top level of the package.")
        self.pkg_dir = pkg_dir
        self.matlab = matlab_bin or os.environ.get("MATLAB_BIN", "matlab")
        self.timeout = timeout_min * 60
        self.script_dir = Path(__file__).resolve().parents[3] / "matlab"

    def run(self, jobs: list[Job], log: Callable[[str], None]) -> list[Prediction]:
        with tempfile.TemporaryDirectory(prefix="socbench-ml-") as td:
            inp, outp = Path(td) / "in.mat", Path(td) / "out.mat"
            cell = np.empty(len(jobs), dtype=object)
            for i, j in enumerate(jobs):
                cell[i] = j.X
            savemat(inp, {"X": cell}, do_compression=False)
            q = lambda p: str(p).replace("\\", "/").replace("'", "''")  # noqa: E731
            cmd = f"addpath('{q(self.script_dir)}'); Run_Model('{q(self.pkg_dir)}','{q(inp)}','{q(outp)}')"
            log(f"matlab -batch (1 session, {len(jobs)} input matrices)")
            try:
                proc = subprocess.run([self.matlab, "-batch", cmd], capture_output=True, text=True, timeout=self.timeout)
            except FileNotFoundError as e:
                raise ModelError(f"Could not start MATLAB ({e}). Set MATLAB_BIN.") from e
            except subprocess.TimeoutExpired as e:
                raise ModelError(f"MATLAB evaluation exceeded {self.timeout / 60:.0f} minutes.") from e
            for line in (proc.stdout + proc.stderr).splitlines():
                if line.strip():
                    log(line.strip())
            if not outp.is_file():
                raise ModelError(f"MATLAB produced no output (exit {proc.returncode}): {proc.stderr[-500:]}")
            res = loadmat(outp, squeeze_me=False)
            err = str(res.get("err", np.array([""]))).strip("[]' ")
            if err and err != "":
                raise ModelError(f"MATLAB model error: {err}")
            preds = res["preds"].reshape(-1)
            secs = np.asarray(res["secs"], dtype=float).reshape(-1)
            if len(preds) != len(jobs):
                raise ModelError("MATLAB returned the wrong number of predictions.")
            return [_finish(j.key, preds[i], j.pad, float(secs[i])) for i, j in enumerate(jobs)]
