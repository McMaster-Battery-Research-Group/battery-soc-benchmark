import PDFDocument from "pdfkit";
import { TEST_CASES, MODEL_TYPE_LABELS, COMPLEXITY_LABELS, type MetricKey } from "@/lib/test-cases";
import type { PerCycleRow, TimeSeriesTrace } from "@/evaluator/types";
import { logoPngPath } from "@/lib/logos";
import { fmtDateTime } from "@/lib/utils";

/**
 * Submission report as a PDF (vector charts, brand palette, A4). Pure Node —
 * used by the download route and attached to the "evaluation complete" email.
 */
const M = "#7A003C", G = "#FDBF57", GREY = "#495965", LINE = "#DBDBDD", INK = "#1d2428", SOFT = "#F2E5EB";
const SERIES = ["#8f2555", "#1f7fb5", "#c98a2e", "#6b62b8"];

export interface ReportInput {
  submission: { id: string; seq: number; modelName: string; description: string; modelType: string; submittedAt: Date; completedAt: Date | null; isPrivate: boolean };
  user: { name: string; affiliation: string };
  collaborators?: { name: string; affiliation: string }[];
  result: Record<MetricKey, number> & { weightedError: number; complexity: number; complexityUncertainty: number; maxError: number; evaluatorVersion: string; perCycle: PerCycleRow[]; timeSeries: TimeSeriesTrace[] };
  siteUrl: string;
}

export function buildSubmissionReport(input: ReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { submission: s, user, result: r, siteUrl } = input;
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: `${s.modelName} — Battery SOC Benchmark report`, Author: "Battery SOC Benchmark, McMaster University" } });
    // The standard Helvetica fonts only cover WinAnsi: map typographic characters
    // that would otherwise print as garbage (− Σ ⱼ … → ≥ ≤).
    const rawText = doc.text.bind(doc);
    (doc as unknown as { text: unknown }).text = ((t: unknown, ...rest: unknown[]) => (rawText as (...a: unknown[]) => PDFKit.PDFDocument)(typeof t === "string" ? pdfSafe(t) : t, ...rest)) as typeof doc.text;
    const rawHeight = doc.heightOfString.bind(doc);
    doc.heightOfString = ((t: string, o?: object) => rawHeight(pdfSafe(t), o)) as typeof doc.heightOfString;
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 96; // content width
    const X0 = 48;
    const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
    const date = (d: Date | null) => (d ? fmtDateTime(d) : "—"); // benchmark timezone with zone label, independent of the server's clock

    // ---------- header band (+ institutional logos at top-right once the official PNGs are supplied)
    doc.rect(0, 0, doc.page.width, 6).fill(M);
    doc.fillColor(M).font("Helvetica-Bold").fontSize(10).text("BATTERY SOC BENCHMARK  ·  McMaster Automotive Resource Centre", X0, 28);
    {
      let lx = X0 + W;
      for (const k of ["nserc", "mcmaster"] as const) {
        const p = logoPngPath(k);
        if (!p) continue;
        lx -= 96;
        doc.image(p, lx, 20, { fit: [96, 28], align: "right", valign: "center" });
        lx -= 14;
      }
    }
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(s.modelName, X0, 48, { width: W });
    const authors = [user, ...(input.collaborators ?? [])];
    const authorLine = authors.length === 1 ? `${user.name}, ${user.affiliation}` : authors.map((a) => `${a.name} (${a.affiliation})`).join(", ");
    doc.fillColor(GREY).font("Helvetica").fontSize(10).text(`Submission #${s.seq}  ·  ${MODEL_TYPE_LABELS[s.modelType] ?? s.modelType}  ·  ${authorLine}`, { width: W });
    doc.text(`Submitted ${date(s.submittedAt)}  ·  Evaluated ${date(s.completedAt)}  ·  Evaluator ${r.evaluatorVersion}${s.isPrivate ? "  ·  PRIVATE" : ""}`, { width: W });
    doc.moveDown(0.6);
    doc.fillColor(INK).fontSize(10).text(s.description, { width: W, lineGap: 1 });
    doc.moveDown(0.8);

    // ---------- headline stats
    const stats = [
      ["Weighted error", `${fmt(r.weightedError)} %`, "official leaderboard score"],
      ["All cells RMSE", `${fmt(r.allCells)} %`, "test 1, every blinded cycle"],
      ["Max error", `${fmt(r.maxError, 1)} %`, "worst instantaneous error"],
      ["Complexity", `${r.complexity} ±${r.complexityUncertainty}`, COMPLEXITY_LABELS[r.complexity] ?? ""],
    ];
    const bw = (W - 3 * 10) / 4;
    let y = doc.y;
    stats.forEach(([k, v, sub], i) => {
      const x = X0 + i * (bw + 10);
      doc.roundedRect(x, y, bw, 58, 4).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.fillColor(GREY).font("Helvetica").fontSize(8).text(k.toUpperCase(), x + 10, y + 9, { width: bw - 20 });
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(18).text(v, x + 10, y + 21, { width: bw - 20 });
      doc.fillColor(GREY).font("Helvetica").fontSize(7.5).text(sub, x + 10, y + 43, { width: bw - 20 });
    });
    y += 74;

    // ---------- test-case bar chart
    const order: MetricKey[] = ["allCells", "blindedCell", "nonBlindedCells", "charging", "massM80", "massM448", "massM448N", "massM1000", "standardCycles", "nonStandardCycles", "initialSocError", "currentSensorOffset"];
    sectionTitle(doc, "Error by test case", "Average RMSE (% SOC) per blinded test case. Lower is better.", X0, y);
    y = doc.y + 6;
    const BAR_LABELS: Partial<Record<MetricKey, string>> = { massM448: "448 kg\nHVAC on", massM448N: "448 kg\nHVAC off", nonStandardCycles: "Non-std\ncycles", nonBlindedCells: "Non-\nblinded", currentSensorOffset: "Current\noffset" };
    barChart(doc, X0, y, W, 170, order.map((k) => ({ label: BAR_LABELS[k] ?? TEST_CASES.find((t) => t.key === k)!.short, value: r[k] })), M);
    y += 190;

    // ---------- temperature chart
    sectionTitle(doc, "Error vs. ambient temperature", "Test 9 — m80 cell at each chamber temperature.", X0, y);
    y = doc.y + 6;
    const temps: [MetricKey, string][] = [["tempM20", "−20 °C"], ["tempM10", "−10 °C"], ["temp0", "0 °C"], ["temp10", "10 °C"], ["temp25", "25 °C"], ["temp40", "40 °C"]];
    barChart(doc, X0, y, W, 130, temps.map(([k, l]) => ({ label: l, value: r[k] })), M);

    // ---------- page 2: test-case table
    doc.addPage();
    sectionTitle(doc, "All test cases", "Weights follow the Blind Modeling Tool V2 specification and sum to 1; test 1 is weighted 0 because every other test is a subset of it.", X0, 48);
    y = doc.y + 8;
    const cols = [36, 190, W - 36 - 190 - 60 - 60, 60, 60];
    tableHeader(doc, X0, y, cols, ["Test", "Name", "Data", "Weight", "RMSE %"]);
    y += 18;
    for (const t of TEST_CASES) {
      const h = Math.max(14, doc.heightOfString(t.description, { width: cols[2] - 8 }) + 6);
      if (y + h > doc.page.height - 60) {
        doc.addPage();
        y = 48;
        tableHeader(doc, X0, y, cols, ["Test", "Name", "Data", "Weight", "RMSE %"]);
        y += 18;
      }
      doc.moveTo(X0, y + h).lineTo(X0 + W, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fillColor(GREY).font("Helvetica").fontSize(8.5).text(String(t.test), X0 + 4, y + 4, { width: cols[0] - 8 });
      doc.fillColor(INK).font("Helvetica-Bold").text(t.label, X0 + cols[0] + 4, y + 4, { width: cols[1] - 8 });
      doc.fillColor(GREY).font("Helvetica").text(t.description, X0 + cols[0] + cols[1] + 4, y + 4, { width: cols[2] - 8 });
      doc.text(t.weight.toFixed(3), X0 + cols[0] + cols[1] + cols[2], y + 4, { width: cols[3] - 6, align: "right" });
      doc.fillColor(INK).font("Helvetica-Bold").text(fmt(r[t.key]), X0 + cols[0] + cols[1] + cols[2] + cols[3], y + 4, { width: cols[4] - 6, align: "right" });
      y += h;
    }
    doc.fillColor(GREY).font("Helvetica").fontSize(8.5).text(`Weighted error = sum over tests of (weight × RMSE) = ${fmt(r.weightedError)} %`, X0, y + 10);

    // ---------- page 3: time-domain traces
    doc.addPage();
    sectionTitle(doc, "Time-domain results", "Estimated vs. reference SOC on representative blinded cycles (down-sampled). One hour of padding precedes every cycle and is excluded from the metrics.", X0, 48);
    // shared legend
    {
      const ly = doc.y + 4;
      doc.fontSize(7);
      doc.rect(X0, ly + 3, 10, 1.6).fill(INK).fillColor(GREY).text("Reference SOC", X0 + 14, ly, { lineBreak: false });
      doc.rect(X0 + 80, ly + 3, 10, 1.6).fill(SERIES[0]).fillColor(GREY).text("Estimated SOC", X0 + 94, ly, { lineBreak: false });
      doc.y = ly + 10;
    }
    y = doc.y + 8;
    const traces = r.timeSeries.slice(0, 8);
    const tw = (W - 12) / 2;
    traces.forEach((tr, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const ty = y + row * 170;
      if (ty + 160 > doc.page.height - 48 && col === 0) {
        doc.addPage();
        y = 48 - row * 170;
      }
      const yy = y + row * 170;
      lineChart(doc, X0 + col * (tw + 12), yy, tw, 150, tr);
    });

    // ---------- per-cycle table
    doc.addPage();
    sectionTitle(doc, "Per-cycle errors", `All ${r.perCycle.length} blinded drive cycles: RMSE, MAE and maximum error (% SOC).`, X0, 48);
    y = doc.y + 8;
    const pc = [60, 60, 80, 70, 70, 70, 70];
    const heads = ["Cell", "Temp", "Cycle", "Duration", "RMSE", "MAE", "MAXE"];
    tableHeader(doc, X0, y, pc, heads);
    y += 18;
    const rows = [...r.perCycle].sort((a, b) => a.cell.localeCompare(b.cell) || a.temperatureC - b.temperatureC || a.cycle.localeCompare(b.cycle));
    for (const row of rows) {
      if (y + 13 > doc.page.height - 60) {
        doc.addPage();
        y = 48;
        tableHeader(doc, X0, y, pc, heads);
        y += 18;
      }
      doc.moveTo(X0, y + 13).lineTo(X0 + pc.reduce((a, b) => a + b, 0), y + 13).lineWidth(0.3).strokeColor(LINE).stroke();
      const vals = [row.cell, `${row.temperatureC} °C`, row.cycle, `${row.durationH.toFixed(2)} h`, fmt(row.rmse), fmt(row.mae), fmt(row.maxErr)];
      let x = X0;
      vals.forEach((v, i) => {
        doc.fillColor(i === 4 ? INK : GREY).font(i === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(8).text(v, x + 4, y + 3, { width: pc[i] - 8, align: i >= 3 ? "right" : "left" });
        x += pc[i];
      });
      y += 13;
    }

    // ---------- footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // footer sits inside the margin; stop pdfkit from paginating
      doc.fillColor(GREY).font("Helvetica").fontSize(7.5);
      doc.text(`Battery SOC Benchmark · ${siteUrl}/submissions/${s.id} · Cite: Kollmeyer et al., IEEE ITEC 2022, doi:10.1109/ITEC53557.2022.9813996`, X0, doc.page.height - 34, { width: W - 60, lineBreak: false });
      doc.text("Developed by the McMaster Automotive Resource Centre, McMaster University, with funding from NSERC / CRSNG.", X0, doc.page.height - 22, { width: W - 60, lineBreak: false });
      doc.text(`${i - range.start + 1} / ${range.count}`, X0, doc.page.height - 34, { width: W, align: "right", lineBreak: false });
    }
    doc.end();
  });
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, sub: string, x: number, y: number) {
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(title, x, y);
  doc.fillColor(GREY).font("Helvetica").fontSize(8.5).text(sub, x, doc.y + 1, { width: doc.page.width - 96 });
}

function tableHeader(doc: PDFKit.PDFDocument, x: number, y: number, cols: number[], heads: string[]) {
  const w = cols.reduce((a, b) => a + b, 0);
  doc.rect(x, y, w, 16).fill("#F6F7F7");
  let cx = x;
  heads.forEach((h, i) => {
    doc.fillColor(GREY).font("Helvetica-Bold").fontSize(7.5).text(h.toUpperCase(), cx + 4, y + 4, { width: cols[i] - 8, align: i >= 3 && cols.length === 7 ? "right" : i >= 3 ? "right" : "left" });
    cx += cols[i];
  });
}

function barChart(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, bars: { label: string; value: number }[], color: string) {
  const padL = 36, padB = 30, padT = 12;
  const max = Math.max(1, ...bars.map((b) => b.value)) * 1.15;
  const plotW = w - padL, plotH = h - padB - padT;
  // grid + axis
  for (let i = 0; i <= 4; i++) {
    const gy = y + padT + plotH - (plotH * i) / 4;
    doc.moveTo(x + padL, gy).lineTo(x + w, gy).lineWidth(0.4).strokeColor("#E8EAEB").stroke();
    doc.fillColor(GREY).font("Helvetica").fontSize(7).text(`${((max * i) / 4).toFixed(1)}%`, x, gy - 4, { width: padL - 6, align: "right" });
  }
  const slot = plotW / bars.length;
  const bw = Math.min(28, slot * 0.6);
  bars.forEach((b, i) => {
    const bh = (b.value / max) * plotH;
    const bx = x + padL + i * slot + (slot - bw) / 2;
    const by = y + padT + plotH - bh;
    doc.roundedRect(bx, by, bw, bh, 2).fill(color);
    doc.fillColor(INK).font("Helvetica").fontSize(7).text(b.value.toFixed(1), bx - 6, by - 9, { width: bw + 12, align: "center" });
    // label gets the whole slot so neighbours never overlap
    doc.fillColor(GREY).fontSize(6.2).text(b.label, x + padL + i * slot + 1, y + padT + plotH + 4, { width: slot - 2, align: "center", lineGap: -0.5 });
  });
}

function lineChart(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, tr: TimeSeriesTrace) {
  const padL = 30, padB = 16, padT = 16;
  const rmse = Math.sqrt(tr.estimated.reduce((a, e, i) => a + (e - tr.actual[i]) ** 2, 0) / tr.estimated.length);
  // Title row: label on the left, RMSE on the right. The legend is shared (section subtitle).
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text(tr.label, x, y, { width: w - 66, height: 12, lineBreak: false, ellipsis: true });
  doc.fillColor(GREY).font("Helvetica").fontSize(7).text(`RMSE ${rmse.toFixed(2)} %`, x + w - 60, y + 1, { width: 60, align: "right" });
  const py = y + padT, plotH = h - padT - padB, plotW = w - padL;
  const tMax = tr.t[tr.t.length - 1] || 1;
  for (let i = 0; i <= 4; i++) {
    const gy = py + plotH - (plotH * i) / 4;
    doc.moveTo(x + padL, gy).lineTo(x + w, gy).lineWidth(0.4).strokeColor("#E8EAEB").stroke();
    doc.fillColor(GREY).fontSize(6.5).text(`${i * 25}%`, x, gy - 3.5, { width: padL - 4, align: "right" });
  }
  const px = (t: number) => x + padL + (t / tMax) * plotW;
  const pyv = (v: number) => py + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const draw = (vals: number[], color: string, width: number) => {
    doc.moveTo(px(tr.t[0]), pyv(vals[0]));
    for (let i = 1; i < vals.length; i++) doc.lineTo(px(tr.t[i]), pyv(vals[i]));
    doc.lineWidth(width).strokeColor(color).stroke();
  };
  draw(tr.actual, INK, 1.1);
  draw(tr.estimated, SERIES[0], 0.9);
  doc.fillColor(GREY).fontSize(6.5).text("0h", x + padL, py + plotH + 4).text(`${tMax.toFixed(1)}h`, x + w - 30, py + plotH + 4, { width: 30, align: "right" });
  void G; void SOFT;
}

/** Replace characters outside WinAnsi (unsupported by the built-in Helvetica) with safe equivalents. */
function pdfSafe(s: string) {
  return s
    .replace(/\u2212/g, "-") // minus sign
    .replace(/[\u03A3\u2211]/g, "sum")
    .replace(/\u2C7C/g, "j")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/\u2192/g, "->")
    .replace(/\u2248/g, "~")
    .replace(/[\u00A0\u2000-\u200B\u202F]/g, " ") // exotic spaces
    .replace(/[^\u0020-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2122\n\t]/g, "?"); // anything else WinAnsi lacks
}
