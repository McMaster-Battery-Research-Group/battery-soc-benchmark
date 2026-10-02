"""Model execution backends.

The evaluator prepares every input matrix up front (padding, offsets, initial-SOC
restarts), hands the whole batch to a backend, and scores the predictions. Two
backends implement the same interface:

  PythonBackend  imports Model.py and iterates Model(X[i], z) in-process
  MatlabBackend  writes the batch to a .mat, runs matlab/Run_Model.m once, reads
                 the predictions back — MATLAB does nothing but execute the model
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
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
    """Runs the submitted model in a SEPARATE child process.

    The model is untrusted and must not share the scorer's process: in-process it could
    monkeypatch the scorer, write the canonical results.json and os._exit(0), or read the
    anti-forgery nonce out of /proc/self/environ. The child (socbench_eval.model_child) is
    spawned with the nonce stripped from its environment, only ever returns prediction arrays,
    and cannot terminate or alter this (the parent/scorer) process. See SECURITY note in
    model_child.py.
    """
    name = "python"

    def __init__(self, pkg_dir: Path):
        self.pkg_dir = Path(pkg_dir)
        # fail fast on an obviously-broken package (missing Model.py / not importable) so the
        # error is the same as before; the real run still happens in the child.
        if not (self.pkg_dir / "Model.py").is_file():
            raise ModelError("Model.py not found at the top level of the package.")

    def run(self, jobs: list[Job], log: Callable[[str], None]) -> list[Prediction]:
        with tempfile.TemporaryDirectory(prefix="socbench-child-") as td:
            tdp = Path(td)
            jobs_path, out_path = tdp / "jobs.npz", tdp / "out.npz"
            arrays = {f"X{i}": j.X for i, j in enumerate(jobs)}
            arrays["n"] = np.array([len(jobs)])
            np.savez(jobs_path, **arrays)

            # strip the result nonce (and nothing else) so the model process can never read it,
            # including via /proc/self/environ — os.environ.pop in the parent would NOT remove it
            # from an already-exec'd process, so it must be absent at spawn time.
            child_env = dict(os.environ)
            child_env.pop("SOCBENCH_RESULT_NONCE", None)

            proc = subprocess.run(
                [sys.executable, "-m", "socbench_eval.model_child", str(self.pkg_dir), str(jobs_path), str(out_path)],
                env=child_env, capture_output=True, text=True,
            )
            err_file = out_path.with_suffix(".error.txt")
            if err_file.is_file():
                raise ModelError(err_file.read_text(encoding="utf-8", errors="replace"))
            if proc.returncode != 0 or not out_path.is_file():
                tail = (proc.stderr or proc.stdout or "")[-500:]
                raise ModelError(f"The model process exited abnormally (code {proc.returncode}). {tail}")

            data = np.load(out_path, allow_pickle=False)
            if int(data.get("ok", np.array([0]))[0]) != 1:
                raise ModelError("The model process did not complete.")
            out, cum = [], _cumulative_samples(jobs)
            for i, j in enumerate(jobs):
                raw = data[f"y{i}"]
                secs = float(data[f"secs{i}"][0])
                out.append(_finish(j.key, raw, j.pad, secs))
                log(f"{cum[i]:5.1f}% | {j.key}")
            return out


def _cumulative_samples(jobs: list[Job]) -> list[float]:
    """Percent of total samples completed after each job (the evaluator's progress axis)."""
    sizes = [int(j.X.shape[0]) for j in jobs]
    total = float(sum(sizes)) or 1.0
    acc, out = 0, []
    for s in sizes:
        acc += s
        out.append(100.0 * acc / total)
    return out


# NOTE: Python model execution (import Model.py, iterate Model(X, z), per-sample scalar checks,
# and user-only tracebacks) now lives in socbench_eval/model_child.py, which runs in a separate
# process so untrusted model code cannot touch the scorer. See PythonBackend above.


# ---------------------------------------------------------------- MATLAB

# "Undefined function 'x'" almost always means a toolbox is missing on the evaluation
# host rather than a bug in the submission. Name the likely product so the message is
# actionable for both the submitter and the administrators.
_TOOLBOX_FUNCS = {
    "Signal Processing Toolbox": {"butter", "filtfilt", "cheby1", "cheby2", "ellip", "designfilt", "sgolayfilt", "medfilt1", "resample", "pwelch", "findpeaks", "lowpass", "highpass", "bandpass"},
    "Deep Learning Toolbox": {"predict", "network", "feedforwardnet", "fitnet", "narxnet", "dlnetwork", "trainNetwork", "predictAndUpdateState", "resetState", "classify", "sim"},
    "Statistics and Machine Learning Toolbox": {"fitrgp", "fitrsvm", "fitrtree", "fitrensemble", "TreeBagger", "mvnpdf", "normrnd", "ksdensity", "regress", "zscore"},
    "Control System Toolbox": {"ss", "tf", "c2d", "lsim", "kalman", "dlqe", "ss2tf", "tf2ss"},
    "System Identification Toolbox": {"iddata", "ssest", "n4sid", "arx", "extendedKalmanFilter", "unscentedKalmanFilter"},
    "Optimization Toolbox": {"fmincon", "lsqnonlin", "fminunc", "lsqcurvefit", "quadprog"},
    "Curve Fitting Toolbox": {"fit", "cfit", "smooth", "fittype"},
    "Fuzzy Logic Toolbox": {"readfis", "evalfis", "mamfis", "sugfis"},
}


def _toolbox_hint(err: str) -> str:
    m = re.search(r"Undefined function '([A-Za-z_]\w*)'", err)
    if not m:
        return ""
    fn = m.group(1)
    for product, funcs in _TOOLBOX_FUNCS.items():
        if fn in funcs:
            return f" — '{fn}' belongs to the {product}, which is not installed on the evaluation host. The administrators have been notified via the log; if you can, avoid the toolbox call (e.g. hard-code filter coefficients)."
    return f" — '{fn}' is not on MATLAB's path here: either it comes from a toolbox that is not installed on the evaluation host, or the function file is missing from your package."


class MatlabBackend(Backend):
    name = "matlab"

    def __init__(self, pkg_dir: Path, matlab_bin: str | None = None, timeout_min: float = 360, license_env: dict[str, str] | None = None):
        if not ((pkg_dir / "Model.m").is_file() or (pkg_dir / "Model.p").is_file()):
            raise ModelError("Model.m or Model.p not found at the top level of the package.")
        self.pkg_dir = pkg_dir
        self.matlab = matlab_bin or os.environ.get("MATLAB_BIN", "matlab")
        self.timeout = timeout_min * 60
        # MATLAB online-licensing vars (MLM_WEB_*). They are injected ONLY into the matlab child's
        # environment here — never into os.environ — so the untrusted model cannot read the
        # MathWorks token from /proc/1/environ. This mirrors matlab-proxy, which hands the same
        # vars to MATLAB via the subprocess env and nowhere else.
        self.license_env = license_env or {}
        # matlab/Run_Model.m: next to the repo checkout, or wherever the sandbox image put it
        self.script_dir = Path(os.environ.get("SOCBENCH_MATLAB_SCRIPTS") or (Path(__file__).resolve().parents[3] / "matlab"))

    def run(self, jobs: list[Job], log: Callable[[str], None]) -> list[Prediction]:
        with tempfile.TemporaryDirectory(prefix="socbench-ml-") as td:
            inp, outp = Path(td) / "in.mat", Path(td) / "out.mat"
            cell = np.empty(len(jobs), dtype=object)
            for i, j in enumerate(jobs):
                cell[i] = j.X
            savemat(inp, {"X": cell}, do_compression=False)
            q = lambda p: str(p).replace("\\", "/").replace("'", "''")  # noqa: E731
            # Defense-in-depth: by the time -batch runs, licence activation is already done at MATLAB
            # startup, so clear the licence vars from MATLAB's own environment before any user code
            # (Run_Model -> Model) can getenv() them. The load-bearing control is still that these
            # vars are only in the matlab child's env, never in os.environ / PID 1 (see child_env).
            scrub = "".join(f"setenv('{k}','');" for k in self.license_env)
            cmd = f"{scrub}addpath('{q(self.script_dir)}'); Run_Model('{q(self.pkg_dir)}','{q(inp)}','{q(outp)}')"
            log(f"matlab -batch (1 session, {len(jobs)} input matrices)")
            # Stream MATLAB's output as it happens so the site can show live progress:
            # Run_Model.m prints "[Run_Model] k/n done ..." after every input matrix, which we
            # translate into the same "NN.N% | key" lines the Python backend emits.
            done_re = re.compile(r"^\[Run_Model\] (\d+)/(\d+) done")
            stderr_tail: list[str] = []
            cum = _cumulative_samples(jobs)  # sample-weighted progress, same axis as the Python backend

            def relay(line: str) -> None:
                line = line.strip()
                if not line:
                    return
                m = done_re.match(line)
                if m:
                    k, n = int(m.group(1)), int(m.group(2))
                    if 0 < k <= len(jobs):
                        log(f"{cum[k - 1]:5.1f}% | {jobs[k - 1].key}")
                    else:
                        log(f"{100 * k / n:5.1f}% | {k}/{n}")
                else:
                    log(line)

            # MATLAB child env = this process's env plus the licence vars (which are NOT in our env).
            matlab_env = {**os.environ, **self.license_env}
            try:
                proc = subprocess.Popen([self.matlab, "-batch", cmd], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, encoding="utf-8", errors="replace", env=matlab_env)
            except FileNotFoundError as e:
                raise ModelError(f"Could not start MATLAB ({e}). Set MATLAB_BIN.") from e
            deadline = time.monotonic() + self.timeout
            assert proc.stdout is not None
            try:
                for line in proc.stdout:
                    relay(line)
                    if "ERROR" in line:
                        stderr_tail.append(line.strip())
                    if time.monotonic() > deadline:
                        proc.kill()
                        raise ModelError(f"MATLAB evaluation exceeded {self.timeout / 60:.0f} minutes.")
                proc.wait(timeout=max(1.0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired as e:
                proc.kill()
                raise ModelError(f"MATLAB evaluation exceeded {self.timeout / 60:.0f} minutes.") from e
            if not outp.is_file():
                raise ModelError(f"MATLAB produced no output (exit {proc.returncode}): {' '.join(stderr_tail)[-500:]}")
            res = loadmat(outp, squeeze_me=False)
            err = str(res.get("err", np.array([""]))).strip("[]' ")
            if err and err != "":
                raise ModelError(f"MATLAB model error: {err}{_toolbox_hint(err)}")
            preds = res["preds"].reshape(-1)
            secs = np.asarray(res["secs"], dtype=float).reshape(-1)
            if len(preds) != len(jobs):
                raise ModelError("MATLAB returned the wrong number of predictions.")
            return [_finish(j.key, preds[i], j.pad, float(secs[i])) for i, j in enumerate(jobs)]
