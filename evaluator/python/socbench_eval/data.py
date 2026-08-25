from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.io import loadmat

CELL_KEYS = ["m80", "m448", "m448N", "m1000"]
CELL_LABELS = {"m80": "m80", "m448": "m448", "m448N": "m448-N", "m1000": "m1000"}
INPUT_ORDER = ("I", "V", "T")  # column order the model receives: Current, Voltage, Temperature
FAMILIES = ("UDDS", "HWFET", "LA92", "US06", "HWCUST", "HWGRADE", "REORDERED", "CC_CV_charge", "Other")


def family(name: str) -> str:
    """Cycle family without the run suffix: HWCUST1 -> HWCUST, but US06 stays US06."""
    for f in FAMILIES:
        if name.startswith(f):
            return f
    return name.rstrip("0123456789")


@dataclass
class Cycle:
    name: str
    temp_c: float
    is_test: bool
    is_charge: bool
    I: np.ndarray
    V: np.ndarray
    T: np.ndarray
    SOC: np.ndarray

    @property
    def base(self) -> str:
        return family(self.name)

    def X(self) -> np.ndarray:
        return np.column_stack([self.I, self.V, self.T]).astype(float)


@dataclass
class BlindData:
    cells: dict[str, list[Cycle]]  # key order = CELL_KEYS, cycle order = file order


def _col(v) -> np.ndarray:
    return np.asarray(v, dtype=float).reshape(-1)


def load_blind_data(path: str | Path, require_all: bool = True) -> BlindData:
    m = loadmat(str(path), squeeze_me=True, struct_as_record=False)
    blind = m["blind"]
    cells: dict[str, list[Cycle]] = {}
    cell_entries = np.atleast_1d(blind.cells)
    for entry in cell_entries:
        name = str(entry.name)
        cycles: list[Cycle] = []
        for c in np.atleast_1d(entry.cycle):
            cycles.append(
                Cycle(
                    name=str(c.name),
                    temp_c=float(c.tempC),
                    is_test=bool(c.isTest),
                    is_charge=bool(c.isCharge),
                    I=_col(c.I),
                    V=_col(c.V),
                    T=_col(c.T),
                    SOC=_col(c.SOC),
                )
            )
        cells[name] = cycles
    missing = [k for k in CELL_KEYS if k not in cells]
    if missing and require_all:
        raise ValueError(f"blind data is missing cells: {missing}")
    return BlindData(cells=cells)
