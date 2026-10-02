"""Isolated model-execution child process.

The submitted model is UNTRUSTED code. Running it in the same process as the scorer let a
malicious model forge its own score (monkeypatch the scorer, or write /out/results.json and
os._exit(0), or read the anti-forgery nonce from /proc/self/environ). This child runs the
model in a SEPARATE process so it can do none of that:

  * it never receives the result nonce (the parent spawns it with that var stripped from the
    environment, so even /proc/self/environ does not contain it);
  * it cannot write the canonical results.json or terminate the scorer — if it exits abnormally
    or produces malformed output, the parent treats the whole run as a model failure;
  * it only ever hands back prediction arrays.

Protocol (chosen to need no imports beyond numpy, and to be robust to the child corrupting
stdout): the parent passes two file paths as argv:
    argv[1] = package dir (contains Model.py)
    argv[2] = jobs .npz   (arrays: X0, X1, ... and a shape index)
    argv[3] = output .npz path to write (arrays y0, y1, ... and secs0, secs1, ...)
On any model error the child writes argv[3] with a single array `error` (a unicode message)
and exits 1.
"""
import sys
import time
from pathlib import Path

import numpy as np


def _scalar(y) -> float:
    a = np.asarray(y, dtype=float).reshape(-1)
    if a.size != 1:
        raise RuntimeError("Model must return exactly one SOC value per sample.")
    v = float(a[0])
    if not np.isfinite(v):
        raise RuntimeError("Model returned NaN or Inf.")
    return v


def _iterate(model, X):
    n = X.shape[0]
    out = np.zeros(n)
    res = model.Model(X[0, :].copy())
    if not (isinstance(res, tuple) and len(res) == 2):
        raise RuntimeError("Model must return a tuple (Y_est, z).")
    y, z = res
    out[0] = _scalar(y)
    for i in range(1, n):
        res = model.Model(X[i, :].copy(), z)
        if not (isinstance(res, tuple) and len(res) == 2):
            raise RuntimeError("Model must return a tuple (Y_est, z).")
        y, z = res
        out[i] = _scalar(y)
    return out


def _load_model(pkg_dir: Path):
    import importlib.util
    model_file = pkg_dir / "Model.py"
    if not model_file.is_file():
        raise RuntimeError("Model.py not found at the top level of the package.")
    if str(pkg_dir) not in sys.path:
        sys.path.insert(0, str(pkg_dir))
    spec = importlib.util.spec_from_file_location("submitted_model", model_file)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not import Model.py.")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not callable(getattr(mod, "Model", None)):
        raise RuntimeError("Model.py must define a callable named Model(X, z).")
    return mod


def main() -> int:
    pkg_dir, jobs_path, out_path = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    try:
        jobs = np.load(jobs_path, allow_pickle=False)
        n_jobs = int(jobs["n"][0])
        model = _load_model(pkg_dir)
        result = {}
        for i in range(n_jobs):
            X = jobs[f"X{i}"]
            t0 = time.perf_counter()
            result[f"y{i}"] = _iterate(model, X)
            result[f"secs{i}"] = np.array([time.perf_counter() - t0])
        result["ok"] = np.array([1])
        np.savez(out_path, **result)
        return 0
    except Exception as e:  # noqa: BLE001
        import traceback
        frames = [f for f in traceback.extract_tb(sys.exc_info()[2]) if "socbench_eval" not in f.filename.replace("\\", "/") and "model_child" not in f.filename]
        tb = "\n".join(f'  File "{Path(f.filename).name}", line {f.lineno}, in {f.name}\n    {f.line}' for f in frames[-6:])
        msg = f"Model raised {type(e).__name__}: {e}" + (f"\nTraceback (most recent call last):\n{tb}" if tb else "")
        try:
            out_path.with_suffix(".error.txt").write_text(msg, encoding="utf-8")
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
