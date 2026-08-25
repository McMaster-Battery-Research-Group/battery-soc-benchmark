"""Load a submitted Model.py and iterate it sample-by-sample, exactly like
IterateAll.m / PythonModelRunner.py do in the MATLAB tool."""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path
from types import ModuleType

import numpy as np

PAD_SAMPLES = 3600  # one hour of constant data prepended to every cycle (Predict_SOC.m)


class ModelError(RuntimeError):
    """Raised when the submitted model misbehaves; message is shown to the submitter."""


def load_model(pkg_dir: Path) -> ModuleType:
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
        raise ModelError(f"Model.py failed to import: {type(e).__name__}: {e}") from e
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


def iterate(model: ModuleType, X: np.ndarray) -> np.ndarray:
    """Call Model(X[0]) then Model(X[i], z) for i>=1; returns SOC predictions (len == rows of X)."""
    n = X.shape[0]
    out = np.zeros(n, dtype=float)
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
        raise ModelError(f"Model raised {type(e).__name__}: {e}") from e
    return out


def predict_soc(model: ModuleType, cycle_X: np.ndarray, offset: float = 0.0, isoc_idx: int = 0):
    """Port of Predict_SOC.m.

    cycle_X: N x 3 [I, V, T]. Returns (SOC_Pred without padding, seconds, n_samples_incl_padding).
    offset:  constant added to current.
    isoc_idx: 0-based start index for the initial-SOC test; when > 0 the padding
              current is ZERO (MATLAB: zeros(3600,1).*X1(1,1)) rather than the first sample.
    """
    X1 = cycle_X[isoc_idx:, :].copy()
    X1[:, 0] = X1[:, 0] + offset
    pad = np.repeat(X1[:1, :], PAD_SAMPLES, axis=0)
    if isoc_idx > 0:
        pad[:, 0] = 0.0
    X = np.vstack([pad, X1])
    t0 = time.perf_counter()
    pred = iterate(model, X)
    secs = time.perf_counter() - t0
    pred = pred[PAD_SAMPLES:]
    pred = np.where(np.isnan(pred), 0.0, pred)
    return pred, secs, X.shape[0]
