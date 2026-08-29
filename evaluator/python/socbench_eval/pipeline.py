"""The benchmark, runtime-independent.

Reproduces the McMaster Standardized Evaluation Tool exactly (verified against
the original MATLAB implementation to 3 decimals): validation run, 144 blinded
cycles + charge cycles, temperature means, initial-SOC and current-offset
sweeps, published weights, complexity bins. Every grouping is positional, so the
exported blind data must keep file order.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

import numpy as np

from .data import CELL_KEYS, CELL_LABELS, BlindData, Cycle, family
from .runner import PAD_SAMPLES, Backend, Job, Prediction, build_input

WEIGHTS = np.array([0, 1 / 10, 1 / 10, 1 / 10, 1 / 30, 2 / 30, 2 / 30, 1 / 30, 1 / 10, 1 / 10, 1 / 60, 1 / 60, 1 / 60, 1 / 60, 1 / 60, 1 / 60, 1 / 10, 1 / 10])
METRIC_KEYS = ["allCells", "blindedCell", "nonBlindedCells", "charging", "massM80", "massM448", "massM448N", "massM1000", "standardCycles", "nonStandardCycles", "tempM20", "tempM10", "temp0", "temp10", "temp25", "temp40", "initialSocError", "currentSensorOffset"]
NORMAL_CYCLES, CUSTOM_CYCLES, N_TEMPS = 4, 2, 6
ISOCS = (0.90, 0.60, 0.30)
ISOC_CYCLES = [("LA92", 25), ("US06", -10), ("US06", 10)]        # m80
OFFSETS = (-0.3, -0.1, -0.05, 0.05, 0.1, 0.3)
OFFSET_CYCLES = [("US06", -10), ("HWFET", 10), ("LA92", 40)]     # m1000
RELEVANT_OFFSET_IDX = [0, 5, 6, 11, 12, 17]                       # ±0.3 A only
# why each plotted drive cycle was chosen (shown under "Key cases" on the site)
CYCLE_NOTES = {
    ("m448N", "LA92", 10): "Tests 1–3 — the non-blinded m448N cell (open data exists for it) on LA92 at 10 °C; compare with the blinded m448 cell on the same cycle.",
    ("m448", "LA92", 10): "Tests 1–3 — the blinded m448 cell (never released) on LA92 at 10 °C. A large gap to m448N means the model over-fits the open cells.",
    ("m80", "CC_CV_charge", 25): "Test 4 — a CC-CV charge at 25 °C. Estimators tuned on discharge often mis-track during charging.",
    ("m80", "UDDS", 10): "Tests 5–6 — the same UDDS cycle at 10 °C for the 80 kg payload (lightest load, lowest currents).",
    ("m448", "UDDS", 10): "Tests 5–6 — the same UDDS cycle at 10 °C for the 448 kg payload.",
    ("m1000", "UDDS", 10): "Tests 5–6 — the same UDDS cycle at 10 °C for the 1000 kg payload (highest currents).",
    ("m80", "UDDS", -20): "Test 9 — coldest condition: high resistance and a strongly non-linear OCV response — the hardest cycle for most estimators.",
    ("m80", "UDDS", 0): "Test 9 — freezing point, gentle urban cycle.",
    ("m80", "UDDS", 40): "Test 9 — hottest condition; low resistance, fast dynamics.",
    ("m80", "US06", 25): "Test 4 — aggressive highway cycle with large current peaks at room temperature (the drive-cycle counterpart of the charging test).",
    ("m1000", "HWFET", 25): "Tests 7–8 — standard highway cycle with the heavy 1000 kg payload; compare with the two non-standard highway profiles.",
    ("m1000", "HWCUST", 25): "Tests 7–8 — custom highway profile the model has never seen in the open data.",
    ("m1000", "HWGRADE", 25): "Tests 7–8 — highway with road grade: long high-current stretches and regeneration.",
}
# The drive cycles the original tool's Create_Figures.m plotted (one per figure panel), in the order of the tests they illustrate
TRACES = {
    ("m448N", "LA92", 10), ("m448", "LA92", 10),                       # tests 1–3: non-blinded vs blinded cell
    ("m80", "US06", 25), ("m80", "CC_CV_charge", 25),                  # test 4: drive vs charging
    ("m80", "UDDS", 10), ("m448", "UDDS", 10), ("m1000", "UDDS", 10),  # tests 5–6: payload
    ("m1000", "HWFET", 25), ("m1000", "HWCUST", 25), ("m1000", "HWGRADE", 25),  # tests 7–8: standard vs non-standard cycles
    ("m80", "UDDS", -20), ("m80", "UDDS", 0), ("m80", "UDDS", 40),     # test 9: temperature
}

Log = Callable[[str], None]


def rmse(a: np.ndarray, p: np.ndarray) -> float:
    return float(100 * math.sqrt(np.mean((a - p) ** 2)))


def _find_cycle(cycles: list[Cycle], base: str, temp: float) -> tuple[int, Cycle]:
    for i, c in enumerate(cycles):
        if c.is_test and c.name.startswith(base) and c.temp_c == temp:
            return i, c
    raise KeyError(f"no {base} at {temp} C")


# ---------------------------------------------------------------- jobs

def validation_job(data: BlindData) -> Job:
    """Same as Validate_Submission.m: m80 UDDS @ 10 C, +0.3 A, 1-minute pad."""
    _, cyc = _find_cycle(data.cells["m80"], "UDDS", 10)
    X1 = cyc.X()
    X1[:, 0] += 0.3
    return Job("validation", np.vstack([np.repeat(X1[:1], 60, axis=0), X1]), 60)


def build_jobs(data: BlindData) -> list[Job]:
    jobs: list[Job] = []
    for key in CELL_KEYS:
        for i, cyc in enumerate(data.cells[key]):
            jobs.append(Job(f"cycle:{key}:{i}", build_input(cyc.X()), PAD_SAMPLES))
    for b, (base, temp) in enumerate(ISOC_CYCLES):
        _, cyc = _find_cycle(data.cells["m80"], base, temp)
        for q, target in enumerate(ISOCS):
            idx = int(np.argmax(cyc.SOC < target))
            jobs.append(Job(f"isoc:{b}:{q}:{idx}", build_input(cyc.X(), 0.0, idx), PAD_SAMPLES))
    for b, (base, temp) in enumerate(OFFSET_CYCLES):
        _, cyc = _find_cycle(data.cells["m1000"], base, temp)
        for j, off in enumerate(OFFSETS):
            jobs.append(Job(f"offset:{b}:{j}", build_input(cyc.X(), off, 0), PAD_SAMPLES))
    return jobs


# ---------------------------------------------------------------- scoring

@dataclass
class CycleResult:
    cell: str
    name: str
    temp_c: float
    rmse: float
    mae: float
    maxe: float
    actual: np.ndarray
    pred: np.ndarray
    is_charge: bool = False  # CC-CV charge cycles are traced (test 4 plot) but not listed in the per-cycle table


def score(data: BlindData, preds: dict[str, Prediction]) -> tuple[dict, dict[str, list[CycleResult]], dict]:
    per_cell: dict[str, list[CycleResult]] = {}
    charge: list[float] = []
    for key in CELL_KEYS:
        rows: list[CycleResult] = []
        for i, cyc in enumerate(data.cells[key]):
            p = preds[f"cycle:{key}:{i}"].soc
            a = cyc.SOC
            if cyc.is_charge:
                charge.append(rmse(a, p))
                per_cell.setdefault("_charge", []).append(CycleResult(key, cyc.name, cyc.temp_c, charge[-1], float(100 * np.mean(np.abs(a - p))), float(100 * np.max(np.abs(a - p))), a, p, is_charge=True))
            elif cyc.is_test:
                rows.append(CycleResult(key, cyc.name, cyc.temp_c, rmse(a, p), float(100 * np.mean(np.abs(a - p))), float(100 * np.max(np.abs(a - p))), a, p))
        per_cell[key] = rows

    # RMSE matrix (rows = test cycles in file order, cols = cells), as in Obtain_Output_Data.m
    cols = [np.array([r.rmse for r in per_cell[k]]) for k in CELL_KEYS]
    n = max(len(c) for c in cols)
    R = np.zeros((n, 4))
    for j, c in enumerate(cols):
        R[: len(c), j] = c
    means = [R[:, j].mean() for j in range(4)]
    res = np.zeros(10)
    res[0] = R[R != 0].mean()
    res[1] = means[1]
    res[2] = np.mean([means[0], means[2], means[3]])
    res[3] = np.mean([v for v in charge if v != 0])
    res[4:8] = means
    S = np.vstack([R[i : i + 4] for i in range(0, n, NORMAL_CYCLES + CUSTOM_CYCLES)])
    C = np.vstack([R[i + 4 : i + 6] for i in range(0, n, NORMAL_CYCLES + CUSTOM_CYCLES)])
    res[8] = np.mean([S[:, 0].mean(), S[S[:, 1] != 0, 1].mean(), S[:, 2].mean(), S[:, 3].mean()])
    res[9] = np.mean([C[:, 0].mean(), C[C[:, 1] != 0, 1].mean(), C[:, 2].mean(), C[:, 3].mean()])

    # Test 9: m80 column, blocks of 6 per temperature in file order (-10,-20,0,10,25,40) → swap first two
    m80 = R[:, 0]
    mean_temp = np.array([m80[b * N_TEMPS : (b + 1) * N_TEMPS].mean() for b in range(N_TEMPS)])
    mean_temp[0], mean_temp[1] = mean_temp[1], mean_temp[0]

    # Test 10: initial SOC, weighted 3/2/1 for 90/60/30 %
    isoc = np.zeros(9)
    for b, (base, temp) in enumerate(ISOC_CYCLES):
        _, cyc = _find_cycle(data.cells["m80"], base, temp)
        for q, target in enumerate(ISOCS):
            idx = int(np.argmax(cyc.SOC < target))
            isoc[b * 3 + q] = rmse(cyc.SOC[idx:], preds[f"isoc:{b}:{q}:{idx}"].soc)
    isoc_weighted = [isoc[b * 3 + q] for b in range(3) for q in range(3) for _ in range(3 - q)]

    # Test 11: current sensor offsets
    sens = np.zeros(18)
    for b, (base, temp) in enumerate(OFFSET_CYCLES):
        _, cyc = _find_cycle(data.cells["m1000"], base, temp)
        for j in range(len(OFFSETS)):
            sens[b * 6 + j] = rmse(cyc.SOC, preds[f"offset:{b}:{j}"].soc)

    scores = np.concatenate([res, mean_temp, [np.mean(isoc_weighted), np.mean(sens[RELEVANT_OFFSET_IDX])]])
    out = {k: round(float(v), 3) for k, v in zip(METRIC_KEYS, scores)}
    out["weightedError"] = round(float(np.sum(WEIGHTS * scores)), 3)
    out["suspicious"] = bool(R.mean() > 25)
    all_rows = [r for k in CELL_KEYS for r in per_cell[k]]
    out["meanMae"] = round(float(np.mean([r.mae for r in all_rows])), 3)
    out["meanMaxe"] = round(float(np.mean([r.maxe for r in all_rows])), 3)
    out["maxError"] = round(float(np.max([r.maxe for r in all_rows])), 3)
    detail = {"initialSocRmse": [round(float(v), 3) for v in isoc], "currentOffsetRmse": [round(float(v), 3) for v in sens]}
    return out, per_cell, detail


# ---------------------------------------------------------------- complexity

def complexity(preds: dict[str, Prediction], runtime: str, calibration: dict[str, float]) -> tuple[int, float]:
    """Time per sample, normalised by a per-runtime calibration constant, binned in
    one-third decades (the original tool's bins). Calibrate so a plain Coulomb
    counter lands in bin 2 on the evaluation host: SOCBENCH_CAL_PYTHON / _MATLAB."""
    cyc = [p for k, p in preds.items() if k.startswith("cycle:")]
    t_sample = float(np.mean([p.secs / p.n_samples for p in cyc]))
    ratio = t_sample / calibration[runtime]
    cat, step = 1, 10 ** (1 / 3)
    while ratio > step:
        ratio /= step
        cat += 1
    return max(1, min(10, cat)), t_sample


# ---------------------------------------------------------------- output rows

def _trace(key: str, label: str, cell: str, cycle: str, temp_c: float, actual: np.ndarray, pred: np.ndarray, group: str, note: str = "") -> dict:
    """Down-sampled SOC trace for the site (~240 points), always including the max-|error| sample."""
    idx = np.unique(np.round(np.linspace(0, len(actual) - 1, min(240, len(actual)))).astype(int))
    idx = np.unique(np.append(idx, int(np.argmax(np.abs(actual - pred)))))
    return {
        "key": key, "label": label, "cell": cell, "cycle": cycle, "temperatureC": temp_c, "group": group, "note": note,
        "t": [round(float(i) / 3600, 3) for i in idx],
        "actual": [round(float(100 * actual[i]), 2) for i in idx],
        "estimated": [round(float(100 * pred[i]), 2) for i in idx],
    }


def robustness_traces(data: BlindData, preds: dict[str, Prediction]) -> list[dict]:
    """The robustness cases the original MATLAB tool plotted: wrong initial SOC (test 10) and current-sensor offset (test 11).
    These are the traces that separate estimators — a drive cycle at 25 °C rarely does."""
    traces: list[dict] = []
    for b, (base, temp) in enumerate(ISOC_CYCLES):
        _, cyc = _find_cycle(data.cells["m80"], base, temp)
        for q, target in enumerate(ISOCS):
            idx = int(np.argmax(cyc.SOC < target))
            pct = int(round(target * 100))
            traces.append(_trace(
                f"isoc-{base}-{int(temp)}-{pct}", f"Wrong initial SOC {pct} % — m80 {base} at {int(temp)} °C", "m80", base, temp,
                cyc.SOC[idx:], preds[f"isoc:{b}:{q}:{idx}"].soc, "initialSoc",
                f"The cycle is joined at the point where the true SOC has already fallen to {pct} %, so a model that assumes a full battery at start-up begins {100 - pct} % off. What matters is how fast the estimate converges onto the truth.",
            ))
    for b, (base, temp) in enumerate(OFFSET_CYCLES):
        _, cyc = _find_cycle(data.cells["m1000"], base, temp)
        for j in (0, len(OFFSETS) - 1):  # ±0.3 A — the offsets that enter the score
            off = OFFSETS[j]
            traces.append(_trace(
                f"offset-{base}-{int(temp)}-{'neg' if off < 0 else 'pos'}", f"Current-sensor offset {off:+.1f} A — m1000 {base} at {int(temp)} °C", "m1000", base, temp,
                cyc.SOC, preds[f"offset:{b}:{j}"].soc, "offset",
                f"A constant {off:+.1f} A is added to the measured current before it reaches the model. Pure current integration drifts linearly; estimators that also use voltage should correct it.",
            ))
    return traces


def per_cycle_rows(per_cell: dict[str, list[CycleResult]]) -> tuple[list[dict], list[dict]]:
    rows, traces = [], []
    for k in CELL_KEYS:
        label = CELL_LABELS[k]
        for r in per_cell[k]:
            base = family(r.name)
            if not r.is_charge:
                rows.append({"cell": label, "cycle": base, "temperatureC": r.temp_c, "rmse": round(r.rmse, 3), "mae": round(r.mae, 3), "maxErr": round(r.maxe, 3), "durationH": round(len(r.actual) / 3600, 2)})
            if (k, base, int(r.temp_c)) in TRACES:
                idx = np.unique(np.round(np.linspace(0, len(r.actual) - 1, min(240, len(r.actual)))).astype(int))
                idx = np.unique(np.append(idx, int(np.argmax(np.abs(r.actual - r.pred)))))  # include the max-error sample
                traces.append({
                    "key": f"{label}-{base}-{int(r.temp_c)}", "label": f"{label} {base} at {int(r.temp_c)} °C",
                    "cell": label, "cycle": base, "temperatureC": r.temp_c,
                    "group": "cycle", "note": CYCLE_NOTES.get((k, base, int(r.temp_c)), ""),
                    "t": [round(float(i) / 3600, 3) for i in idx],
                    "actual": [round(float(100 * r.actual[i]), 2) for i in idx],
                    "estimated": [round(float(100 * r.pred[i]), 2) for i in idx],
                })
    for r in per_cell.get("_charge", []):  # charge cycles: traced when listed (test 4 plot), never in the per-cycle table
        base = family(r.name)
        if (r.cell, base, int(r.temp_c)) in TRACES:
            label = CELL_LABELS[r.cell]
            traces.append(_trace(f"{label}-{base}-{int(r.temp_c)}", f"{label} {base} at {int(r.temp_c)} °C", label, base, r.temp_c, r.actual, r.pred, "cycle", CYCLE_NOTES.get((r.cell, base, int(r.temp_c)), "")))
    return rows, traces
