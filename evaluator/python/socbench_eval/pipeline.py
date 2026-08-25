"""Port of Obtain_Output_Data.m + the robustness sweeps of Create_Figures.m +
the scoring block of Process_Submission.m. Every grouping is positional, as in
the MATLAB tool, so the exported blind data must keep file order."""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from types import ModuleType
from typing import Callable

import numpy as np

from .data import CELL_KEYS, CELL_LABELS, BlindData, Cycle, family
from .runner import predict_soc

WEIGHTS = np.array([0, 1 / 10, 1 / 10, 1 / 10, 1 / 30, 2 / 30, 2 / 30, 1 / 30, 1 / 10, 1 / 10, 1 / 60, 1 / 60, 1 / 60, 1 / 60, 1 / 60, 1 / 60, 1 / 10, 1 / 10])
NORMAL_CYCLES, CUSTOM_CYCLES = 4, 2
N_TEMPS = 6
ISOCS = (0.90, 0.60, 0.30)
OFFSETS = (-0.3, -0.1, -0.05, 0.05, 0.1, 0.3)
RELEVANT_OFFSET_IDX = [0, 5, 6, 11, 12, 17]  # ±0.3 A on each of the three cycles
TRACES = {("m80", "UDDS", -20), ("m80", "UDDS", 0), ("m80", "UDDS", 40), ("m80", "US06", 25), ("m1000", "HWFET", 25), ("m1000", "HWCUST", 25), ("m1000", "HWGRADE", 25), ("m448", "LA92", 10)}

Log = Callable[[str], None]


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
    secs: float
    nsamples: int


@dataclass
class Evaluation:
    per_cell: dict[str, list[CycleResult]] = field(default_factory=dict)  # test cycles only, file order
    charge_rmse: list[float] = field(default_factory=list)
    complexity_score: float = 0.0


def rmse(a: np.ndarray, p: np.ndarray) -> float:
    return float(100 * math.sqrt(np.mean((a - p) ** 2)))


def run_all_cycles(model: ModuleType, data: BlindData, log: Log) -> Evaluation:
    ev = Evaluation()
    total = sum(len(v) for v in data.cells.values())
    done = 0
    t_sample, t_flop, t_mop = [], [], []
    flop_ref = mop_ref = None
    for key in CELL_KEYS:
        results: list[CycleResult] = []
        for i, cyc in enumerate(data.cells[key]):
            done += 1
            log(f"{100 * done / total:5.1f}% | {key} | {cyc.name} @ {cyc.temp_c:g}C")
            pred, secs, n = predict_soc(model, cyc.X())
            if i % 10 == 0 or flop_ref is None:
                flop_ref, mop_ref = flops_mem_counter(1, 0.5)
            t_sample.append(secs / n)
            t_flop.append(1 / flop_ref)
            t_mop.append(1 / mop_ref)
            act = cyc.SOC
            if cyc.is_charge:
                ev.charge_rmse.append(rmse(act, pred))
            elif cyc.is_test:
                results.append(
                    CycleResult(key, cyc.name, cyc.temp_c, rmse(act, pred), float(100 * np.mean(np.abs(act - pred))), float(100 * np.max(np.abs(act - pred))), act, pred, secs, n)
                )
        ev.per_cell[key] = results
    ts, tf, tm = np.array(t_sample), np.array(t_flop), np.array(t_mop)
    alpha = tf / (tf + tm)
    beta = tm / (tf + tm)
    ev.complexity_score = float(np.mean(ts / (tf * beta + tm * alpha)))
    return ev


def flops_mem_counter(repeats: int = 1, runtime: float = 1.0) -> tuple[float, float]:
    """Port of FLOPS_MEM_counter.m — a machine-speed proxy used to normalise the
    complexity score. Python is ~10-50x slower per op than MATLAB JIT here, which
    means the *same* model may land in a different complexity bin than the MATLAB
    tool would give. Calibrate SOCBENCH_COMPLEXITY_SCALE if bins must match."""
    rng = np.random.default_rng(0)
    arr = rng.random(100_000)
    flops, mops = [], []
    for _ in range(repeats):
        cnt, res, t0 = 0, 0.0, time.perf_counter()
        while time.perf_counter() - t0 < runtime:
            res += rng.random() * rng.random()
            res += math.sqrt(rng.random())
            res += math.log(rng.random() + 1e-12)
            cnt += 6
        flops.append(cnt / (time.perf_counter() - t0))
        cnt, t0 = 0, time.perf_counter()
        while time.perf_counter() - t0 < runtime:
            for _ in range(100):
                res = arr[rng.integers(0, 100_000)]
            cnt += 100
        mops.append(cnt / (time.perf_counter() - t0))
    return float(np.mean(flops)), float(np.mean(mops))


def complexity_category(score: float, scale: float = 1.0) -> int:
    """Port of scoring() in Obtain_Output_Data.m: bins of one-third decade."""
    v = score * scale
    cat = 1
    step = 10 ** (1 / 3)
    while v > step:
        v /= step
        cat += 1
    return cat  # MATLAB reports "cat-1,cat,cat+1"


def _find(results: list[CycleResult], base: str, temp: float) -> int:
    for i, r in enumerate(results):
        if r.name.startswith(base) and r.temp_c == temp:
            return i
    raise KeyError(f"no {base} at {temp} C")


def _find_cycle(cycles: list[Cycle], base: str, temp: float) -> Cycle:
    for c in cycles:
        if c.name.startswith(base) and c.temp_c == temp and c.is_test:
            return c
    raise KeyError(f"no {base} at {temp} C")


def robustness(model: ModuleType, data: BlindData, ev: Evaluation, log: Log) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (mean_rmse_temp[6] ordered -20..40, rmse_isoc[9], rmse_sens[18]) as in Create_Figures.m."""
    m80 = ev.per_cell["m80"]
    R = np.array([r.rmse for r in m80])
    # Test 9: positional blocks of 6 cycles per temperature; file order is -10,-20,0,10,25,40 → swap first two
    mean_temp = np.array([R[b * N_TEMPS : (b + 1) * N_TEMPS].mean() for b in range(N_TEMPS)])
    mean_temp[0], mean_temp[1] = mean_temp[1], mean_temp[0]

    # Test 10: initial-SOC error on m80 25C LA92, -10C US06, 10C US06 starting at 90/60/30 %
    isoc = np.zeros(9)
    for b, (base, temp) in enumerate([("LA92", 25), ("US06", -10), ("US06", 10)]):
        cyc = _find_cycle(data.cells["m80"], base, temp)
        act = cyc.SOC
        for q, target in enumerate(ISOCS):
            idx = int(np.argmax(act < target))
            log(f"iSOC {int(target * 100)}% on m80 {cyc.name} @ {temp}C")
            pred, _, _ = predict_soc(model, cyc.X(), 0.0, idx)
            isoc[b * 3 + q] = rmse(act[idx:], pred)

    # Test 11: current-sensor offsets on m1000 -10C US06, 10C HWFET, 40C LA92
    sens = np.zeros(18)
    for b, (base, temp) in enumerate([("US06", -10), ("HWFET", 10), ("LA92", 40)]):
        cyc = _find_cycle(data.cells["m1000"], base, temp)
        for j, off in enumerate(OFFSETS):
            log(f"offset {off:+.2f} A on m1000 {cyc.name} @ {temp}C")
            pred, _, _ = predict_soc(model, cyc.X(), off, 0)
            sens[b * 6 + j] = rmse(cyc.SOC, pred)
    return mean_temp, isoc, sens


def score(ev: Evaluation, mean_temp: np.ndarray, isoc: np.ndarray, sens: np.ndarray) -> dict:
    """Port of the scoring block in Process_Submission.m."""
    cols = [np.array([r.rmse for r in ev.per_cell[k]]) for k in CELL_KEYS]
    n = max(len(c) for c in cols)
    RMSE = np.zeros((n, 4))
    for j, c in enumerate(cols):
        RMSE[: len(c), j] = c
    nz = RMSE[RMSE != 0]
    means = [RMSE[:, j].mean() for j in range(4)]
    res = np.zeros(10)
    res[0] = nz.mean()
    res[1] = means[1]
    res[2] = np.mean([means[0], means[2], means[3]])
    res[3] = np.mean([v for v in ev.charge_rmse if v != 0])
    res[4:8] = means
    std_rows, cus_rows = [], []
    for i in range(0, n, NORMAL_CYCLES + CUSTOM_CYCLES):
        std_rows.append(RMSE[i : i + 4, :])
        cus_rows.append(RMSE[i + 4 : i + 6, :])
    S, C = np.vstack(std_rows), np.vstack(cus_rows)
    std_means = [S[:, 0].mean(), S[S[:, 1] != 0, 1].mean(), S[:, 2].mean(), S[:, 3].mean()]
    cus_means = [C[:, 0].mean(), C[C[:, 1] != 0, 1].mean(), C[:, 2].mean(), C[:, 3].mean()]
    res[8], res[9] = np.mean(std_means), np.mean(cus_means)
    isoc_weighted = []
    for b in range(0, 9, 3):
        for j in range(3):
            isoc_weighted += [isoc[b + j]] * (3 - j)
    scores = np.concatenate([res, mean_temp, [np.mean(isoc_weighted), np.mean(sens[RELEVANT_OFFSET_IDX])]])
    final = float(np.sum(WEIGHTS * scores))
    keys = ["allCells", "blindedCell", "nonBlindedCells", "charging", "massM80", "massM448", "massM448N", "massM1000", "standardCycles", "nonStandardCycles", "tempM20", "tempM10", "temp0", "temp10", "temp25", "temp40", "initialSocError", "currentSensorOffset"]
    out = {k: round(float(v), 3) for k, v in zip(keys, scores)}
    out["weightedError"] = round(final, 3)
    out["suspicious"] = bool(RMSE.mean() > 25)
    all_mae = [r.mae for k in CELL_KEYS for r in ev.per_cell[k]]
    all_maxe = [r.maxe for k in CELL_KEYS for r in ev.per_cell[k]]
    out["meanMae"] = round(float(np.mean(all_mae)), 3)
    out["meanMaxe"] = round(float(np.mean(all_maxe)), 3)
    out["maxError"] = round(float(np.max(all_maxe)), 3)
    return out


def per_cycle_rows(ev: Evaluation) -> tuple[list[dict], list[dict]]:
    rows, traces = [], []
    for k in CELL_KEYS:
        label = CELL_LABELS[k]
        for r in ev.per_cell[k]:
            base = family(r.name)
            rows.append({"cell": label, "cycle": base, "temperatureC": r.temp_c, "rmse": round(r.rmse, 3), "mae": round(r.mae, 3), "maxErr": round(r.maxe, 3), "durationH": round(len(r.actual) / 3600, 2)})
            if (k, base, int(r.temp_c)) in TRACES:
                idx = np.unique(np.round(np.linspace(0, len(r.actual) - 1, min(240, len(r.actual)))).astype(int))
                traces.append({
                    "key": f"{label}-{base}-{int(r.temp_c)}",
                    "label": f"{label} {base} at {int(r.temp_c)} °C",
                    "cell": label, "cycle": base, "temperatureC": r.temp_c,
                    "t": [round(float(i) / 3600, 3) for i in idx],
                    "actual": [round(float(100 * r.actual[i]), 2) for i in idx],
                    "estimated": [round(float(100 * r.pred[i]), 2) for i in idx],
                })
    return rows, traces
