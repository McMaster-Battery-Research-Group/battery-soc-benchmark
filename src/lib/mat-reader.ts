import { inflateSync } from "zlib";

/**
 * Minimal reader for MATLAB Level-5 (.mat v7) files as scipy.io.savemat writes them: little-endian,
 * zlib-compressed top-level elements, char / numeric / cell arrays. Enough to pull one run out of
 * the evaluator's traces.mat (write_full_traces in pipeline.py) on the web host, without MATLAB or
 * a Python process. Struct, sparse and object arrays are reported as "other" and skipped.
 */
export type MatValue =
  | { kind: "char"; text: string }
  | { kind: "num"; dims: number[]; data: number[] }
  | { kind: "cell"; dims: number[]; items: MatValue[] }
  | { kind: "other" };

const MI = { INT8: 1, UINT8: 2, INT16: 3, UINT16: 4, INT32: 5, UINT32: 6, SINGLE: 7, DOUBLE: 9, INT64: 12, UINT64: 13, MATRIX: 14, COMPRESSED: 15, UTF8: 16, UTF16: 17, UTF32: 18 } as const;
const MX_CELL = 1, MX_CHAR = 4;

type Elem = { type: number; data: Buffer };

/** Sub-elements of a matrix: full elements are padded to 8 bytes, "small" ones pack type, size and data into 8 bytes. */
function* elements(buf: Buffer): Generator<Elem> {
  let pos = 0;
  while (pos + 8 <= buf.length) {
    let type = buf.readUInt32LE(pos);
    if (type >>> 16) {
      const size = type >>> 16;
      type &= 0xffff;
      yield { type, data: buf.subarray(pos + 4, pos + 4 + size) };
      pos += 8;
    } else {
      const size = buf.readUInt32LE(pos + 4);
      yield { type, data: buf.subarray(pos + 8, pos + 8 + size) };
      pos += 8 + size;
      pos += (8 - (pos % 8)) % 8;
    }
  }
}

function decodeNumeric(el: Elem): number[] {
  const d = el.data;
  const out: number[] = [];
  switch (el.type) {
    case MI.INT8: for (let i = 0; i < d.length; i++) out.push(d.readInt8(i)); break;
    case MI.UINT8: case MI.UTF8: for (let i = 0; i < d.length; i++) out.push(d[i]); break;
    case MI.INT16: for (let i = 0; i + 2 <= d.length; i += 2) out.push(d.readInt16LE(i)); break;
    case MI.UINT16: case MI.UTF16: for (let i = 0; i + 2 <= d.length; i += 2) out.push(d.readUInt16LE(i)); break;
    case MI.INT32: for (let i = 0; i + 4 <= d.length; i += 4) out.push(d.readInt32LE(i)); break;
    case MI.UINT32: case MI.UTF32: for (let i = 0; i + 4 <= d.length; i += 4) out.push(d.readUInt32LE(i)); break;
    case MI.SINGLE: for (let i = 0; i + 4 <= d.length; i += 4) out.push(d.readFloatLE(i)); break;
    case MI.DOUBLE: for (let i = 0; i + 8 <= d.length; i += 8) out.push(d.readDoubleLE(i)); break;
    case MI.INT64: for (let i = 0; i + 8 <= d.length; i += 8) out.push(Number(d.readBigInt64LE(i))); break;
    case MI.UINT64: for (let i = 0; i + 8 <= d.length; i += 8) out.push(Number(d.readBigUInt64LE(i))); break;
    default: throw new Error(`Unsupported MAT data type ${el.type}`);
  }
  return out;
}

function decodeChar(el: Elem): string {
  if (el.type === MI.UTF8) return el.data.toString("utf8");
  if (el.type === MI.UINT8 || el.type === MI.INT8) return el.data.toString("latin1");
  return String.fromCharCode(...decodeNumeric(el));
}

function parseMatrix(buf: Buffer): { name: string; value: MatValue } {
  const it = elements(buf);
  const flags = it.next().value as Elem | undefined;
  const dimsEl = it.next().value as Elem | undefined;
  const nameEl = it.next().value as Elem | undefined;
  if (!flags || !dimsEl || !nameEl) throw new Error("Truncated MAT matrix element");
  const cls = flags.data.readUInt32LE(0) & 0xff;
  const dims: number[] = [];
  for (let i = 0; i + 4 <= dimsEl.data.length; i += 4) dims.push(dimsEl.data.readInt32LE(i));
  const name = nameEl.data.toString("latin1");
  const n = dims.reduce((a, b) => a * b, 1);
  if (cls === MX_CELL) {
    const items: MatValue[] = [];
    for (let i = 0; i < n; i++) {
      const e = it.next().value as Elem | undefined;
      if (!e) break;
      items.push(e.type === MI.MATRIX ? parseMatrix(e.data).value : { kind: "other" });
    }
    return { name, value: { kind: "cell", dims, items } };
  }
  if (cls !== MX_CHAR && (cls < 6 || cls > 15)) return { name, value: { kind: "other" } }; // struct, object, sparse, function handles
  const dataEl = it.next().value as Elem | undefined;
  if (!dataEl) return { name, value: cls === MX_CHAR ? { kind: "char", text: "" } : { kind: "num", dims, data: [] } };
  if (cls === MX_CHAR) return { name, value: { kind: "char", text: decodeChar(dataEl) } };
  return { name, value: { kind: "num", dims, data: decodeNumeric(dataEl) } };
}

/** All top-level variables of a v7 MAT-file, by name. */
export function readMat(buf: Buffer): Record<string, MatValue> {
  if (buf.length < 128 || buf.toString("latin1", 0, 6) !== "MATLAB") throw new Error("Not a MATLAB v7 MAT-file");
  if (buf.toString("latin1", 126, 128) !== "IM") throw new Error("Big-endian MAT-files are not supported");
  const out: Record<string, MatValue> = {};
  let pos = 128;
  while (pos + 8 <= buf.length) {
    const type = buf.readUInt32LE(pos);
    const size = buf.readUInt32LE(pos + 4);
    const data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size;
    if (type === MI.COMPRESSED) {
      // scipy writes compressed elements back to back, without padding; the stream holds one matrix
      const el = elements(inflateSync(data)).next().value as Elem | undefined;
      if (el?.type === MI.MATRIX) {
        const { name, value } = parseMatrix(el.data);
        out[name] = value;
      }
    } else {
      if (type === MI.MATRIX) {
        const { name, value } = parseMatrix(data);
        out[name] = value;
      }
      pos += (8 - (pos % 8)) % 8;
    }
  }
  return out;
}

/** One evaluation run from the evaluator's traces.mat: SOC in hundredths of a percent (int16), actual null for the blinded cell. */
export interface FullRun {
  name: string;
  cell: string;
  cycle: string;
  tempC: number;
  group: string;
  actual: number[] | null;
  est: number[];
}

const str = (v: MatValue | undefined) => (v?.kind === "char" ? v.text : "");

/** Every run listed in a traces.mat written by write_full_traces() (pipeline.py), with its samples. */
export function runsOfTracesMat(buf: Buffer): FullRun[] {
  const v = readMat(buf);
  const cells = (k: string) => (v[k]?.kind === "cell" ? v[k].items : []);
  const names = cells("name"), cellNames = cells("cell"), cycles = cells("cycle"), groups = cells("group"), act = cells("soc_actual"), est = cells("soc_est");
  const temps = v.tempC?.kind === "num" ? v.tempC.data : [];
  const runs: FullRun[] = [];
  for (let i = 0; i < names.length; i++) {
    const a = act[i], e = est[i];
    runs.push({
      name: str(names[i]), cell: str(cellNames[i]), cycle: str(cycles[i]), tempC: temps[i] ?? NaN, group: str(groups[i]),
      actual: a?.kind === "num" && a.data.length ? a.data : null,
      est: e?.kind === "num" ? e.data : [],
    });
  }
  return runs;
}
