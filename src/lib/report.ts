import PDFDocument from "pdfkit";
import { existsSync } from "fs";
import path from "path";
import { TEST_CASES, MODEL_TYPE_LABELS, COMPLEXITY_LABELS, type MetricKey } from "@/lib/test-cases";
import type { PerCycleRow, TimeSeriesTrace } from "@/evaluator/types";
import { logoPngPath } from "@/lib/logos";
import { scoreShares } from "@/lib/score-share";
import { fmtDateTime } from "@/lib/utils";

/**
 * Submission report as a PDF: A4, vector charts, the site's palette and heading face (Poppins).
 * Pure Node; used by the download route and attached to the "evaluation complete" e-mail.
 *
 *   1  Summary: headline figures, every test case as bars, where the score comes from, temperature
 *   2  Scorecard: each test with its weight, RMSE and contribution, summing to the score (+ history)
 *   3  How the score is computed
 *   4  All 144 cycles at a glance: one RMSE grid per cell
 *   5+ Time-domain traces, then the robustness cases
 *   A  Per-cycle table (two columns per page)
 */
const M = "#7A003C", GREY = "#495965", GREY_SOFT = "#929ba3", LINE = "#DBDBDD", INK = "#1d2428", SOFT = "#F2E5EB", PANEL = "#F6F7F7";
const EST = "#8f2555";
const RAMP = ["#faf3f6", "#f2e5eb", "#e4ccd8", "#ca99b1", "#af6689", "#953363", "#7a003c", "#620030"];

const PAGE_W = 595.28, PAGE_H = 841.89, MX = 44, TOP = 44, BOTTOM = 58;
const W = PAGE_W - 2 * MX;

export interface ReportInput {
  submission: { id: string; seq: number; version?: number; modelName: string; description: string; modelType: string; submittedAt: Date; completedAt: Date | null; isPrivate: boolean };
  /** public author list in order (getPublicAuthors) */
  authors: { name: string; affiliation: string }[];
  /** score history (append-only); rendered after the scorecard when it has more than one entry */
  history?: { createdAt: Date; kind: string; evaluatorVersion: string; weightedError: number | null; note: string | null }[];
  /** active scoring weights (defaults when omitted) */
  weights?: Partial<Record<MetricKey, number>>;
  result: Record<MetricKey, number> & { weightedError: number; complexity: number; complexityUncertainty: number; maxError: number; evaluatorVersion: string; perCycle: PerCycleRow[]; timeSeries: TimeSeriesTrace[] };
  siteUrl: string;
}

type Doc = PDFKit.PDFDocument;

/** Heading face: Poppins when the TTFs are present (public/fonts), else Helvetica. */
function fonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const have = (f: string) => existsSync(path.join(dir, f));
  const ok = have("Poppins-Regular.ttf") && have("Poppins-SemiBold.ttf") && have("Poppins-Bold.ttf");
  return {
    register(doc: Doc) {
      if (!ok) return;
      doc.registerFont("H", path.join(dir, "Poppins-Regular.ttf"));
      doc.registerFont("H-Semi", path.join(dir, "Poppins-SemiBold.ttf"));
      doc.registerFont("H-Bold", path.join(dir, "Poppins-Bold.ttf"));
    },
    h: ok ? "H" : "Helvetica",
    semi: ok ? "H-Semi" : "Helvetica-Bold",
    bold: ok ? "H-Bold" : "Helvetica-Bold",
    body: "Helvetica",
    bodyBold: "Helvetica-Bold",
  };
}

export function buildSubmissionReport(input: ReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { submission: s, result: r, siteUrl, authors } = input;
    const F = fonts();
    const doc = new PDFDocument({ size: "A4", margins: { top: TOP, bottom: BOTTOM, left: MX, right: MX }, bufferPages: true, info: { Title: `${s.modelName}: Battery SOC Benchmark report`, Author: "Battery SOC Benchmark, McMaster University" } });
    F.register(doc);
    // Helvetica covers WinAnsi only: map the typographic characters it lacks (− Σ → ≥ ≤) to safe equivalents.
    const rawText = doc.text.bind(doc);
    (doc as unknown as { text: unknown }).text = ((t: unknown, ...rest: unknown[]) => (rawText as (...a: unknown[]) => Doc)(typeof t === "string" ? pdfSafe(t) : t, ...rest)) as typeof doc.text;
    const rawHeight = doc.heightOfString.bind(doc);
    doc.heightOfString = ((t: string, o?: object) => rawHeight(pdfSafe(t), o)) as typeof doc.heightOfString;
    const rawWidth = doc.widthOfString.bind(doc);
    doc.widthOfString = ((t: string, o?: object) => rawWidth(pdfSafe(t), o)) as typeof doc.widthOfString;
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fmt = (v: number | null | undefined, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
    const date = (d: Date | null) => (d ? fmtDateTime(d) : "—");
    const weightOf = (k: MetricKey) => input.weights?.[k] ?? TEST_CASES.find((t) => t.key === k)!.weight;
    const limit = PAGE_H - BOTTOM;
    let y = TOP;
    const newPage = () => {
      doc.addPage();
      y = TOP + 14; // room for the running header
    };
    const ensure = (h: number) => {
      if (y + h > limit) newPage();
    };
    const section = (title: string, sub?: string) => {
      doc.fillColor(INK).font(F.bold).fontSize(14).text(title, MX, y, { width: W });
      y = doc.y + 1;
      if (sub) {
        doc.fillColor(GREY).font(F.body).fontSize(8.5).text(sub, MX, y, { width: W, lineGap: 1 });
        y = doc.y;
      }
      y += 8;
    };
    /** Trim a string to one line of the current font at width w, with an ellipsis. */
    const fit = (text: string, w: number) => fitTo(doc, text, w);
    const label = (text: string, x: number, yy: number, w: number, align: "left" | "right" | "center" = "left") =>
      doc.fillColor(GREY).font(F.semi).fontSize(7).text(text.toUpperCase(), x, yy, { width: w, align, characterSpacing: 0.6 });

    // ============================================================ page 1: summary
    doc.rect(0, 0, PAGE_W, 40).fill(M);
    doc.fillColor("#ffffff").font(F.semi).fontSize(8).text("BATTERY SOC BENCHMARK", MX, 15, { characterSpacing: 1.2, lineBreak: false });
    doc.fillColor("#ffffff").font(F.body).fontSize(8).text("Evaluation report", MX + 150, 15.5, { lineBreak: false });
    doc.fillColor("#f9d9e6").font(F.body).fontSize(7.5).text(`Generated ${fmtDateTime(new Date())}`, MX, 16, { width: W, align: "right", lineBreak: false });
    y = 58;
    // logos top-right, title to their left
    {
      let lx = MX + W;
      for (const k of ["nserc", "mcmaster"] as const) {
        const p = logoPngPath(k);
        if (!p) continue;
        lx -= 84;
        doc.image(p, lx, y, { fit: [84, 30], align: "right", valign: "center" });
        lx -= 12;
      }
    }
    const titleW = W - 200;
    doc.fillColor(INK).font(F.bold).fontSize(19).text(s.modelName, MX, y - 2, { width: titleW, lineGap: -2 });
    y = doc.y + 3;
    const authorLine = authors.length === 1 ? [authors[0].name, authors[0].affiliation].filter(Boolean).join(", ") : authors.map((a) => (a.affiliation ? `${a.name} (${a.affiliation})` : a.name)).join(", ");
    doc.fillColor(INK).font(F.body).fontSize(9.5).text(authorLine, MX, y, { width: titleW });
    y = doc.y + 2;
    const [evalVersion, evalRuntime] = r.evaluatorVersion.split("/");
    doc.fillColor(GREY).font(F.body).fontSize(8).text(`Submission #${s.seq}${(s.version ?? 1) > 1 ? ` (v${s.version})` : ""}  ·  ${MODEL_TYPE_LABELS[s.modelType] ?? s.modelType}  ·  Evaluator ${evalVersion}${evalRuntime ? ` (${evalRuntime})` : ""}${s.isPrivate ? "  ·  PRIVATE" : ""}`, MX, y, { width: W });
    doc.text(`Submitted ${date(s.submittedAt)}  ·  Evaluated ${date(s.completedAt)}`, MX, doc.y + 1, { width: W });
    y = doc.y;
    if (s.description && s.description.trim() !== s.modelName.trim()) {
      doc.fillColor(GREY).font(F.body).fontSize(8.5).text(s.description, MX, y + 4, { width: W, lineGap: 1, height: 36, ellipsis: true });
      y = doc.y;
    }
    y += 14;

    // headline tiles
    const tiles = [
      ["Weighted error", `${fmt(r.weightedError)} %`, "official leaderboard score"],
      ["All cells RMSE", `${fmt(r.allCells)} %`, "test 1, every blinded cycle"],
      ["Max error", `${fmt(r.maxError, 1)} %`, "worst instantaneous error"],
      ["Complexity", `${r.complexity} ±${r.complexityUncertainty}`, COMPLEXITY_LABELS[r.complexity] ?? "relative to a coulomb counter"],
    ];
    const tw = (W - 3 * 10) / 4, th = 58;
    tiles.forEach(([k, v, sub], i) => {
      const x = MX + i * (tw + 10);
      doc.roundedRect(x, y, tw, th, 4).fill(i === 0 ? SOFT : PANEL);
      doc.rect(x, y + 10, 3, th - 20).fill(M);
      label(k, x + 12, y + 9, tw - 20);
      doc.fillColor(i === 0 ? M : INK).font(F.bold).fontSize(17).text(v, x + 12, y + 19, { width: tw - 20, lineBreak: false });
      doc.fillColor(GREY).font(F.body).fontSize(7.5).text(fit(sub, tw - 20), x + 12, y + 42, { lineBreak: false });
    });
    y += th + 18;

    // every test case as bars
    const order: MetricKey[] = ["allCells", "blindedCell", "nonBlindedCells", "charging", "massM80", "massM448", "massM448N", "massM1000", "standardCycles", "nonStandardCycles", "initialSocError", "currentSensorOffset"];
    const BAR_LABELS: Partial<Record<MetricKey, string>> = { allCells: "All cells\n(T1)", blindedCell: "Blinded\ncell", nonBlindedCells: "Non-blinded\ncells", charging: "Charging", massM80: "80 kg", massM448: "448 kg\nHVAC on", massM448N: "448 kg\nHVAC off", massM1000: "1000 kg", standardCycles: "Standard\ncycles", nonStandardCycles: "Non-std\ncycles", initialSocError: "Initial\nSOC error", currentSensorOffset: "Current\noffset" };
    chartTitle(doc, F, "Error by test case", "Average RMSE (% SOC) per blinded test case. Lower is better. The first bar is the headline accuracy; it carries no weight because every other test is a subset of it.", MX, y, W);
    y = doc.y + 6;
    barChart(doc, F, MX, y, W, 184, order.map((k) => ({ label: BAR_LABELS[k] ?? TEST_CASES.find((t) => t.key === k)!.short, value: r[k], muted: k === "allCells" })));
    y += 184 + 20;

    // where the score comes from (donut) + temperature
    const leftW = 246, rightW = W - leftW - 18, rowH = 196;
    chartTitle(doc, F, "Where the score comes from", "Each group's weight × RMSE as a share of the weighted error.", MX, y, leftW);
    chartTitle(doc, F, "Error vs. ambient temperature", "Test 9: the m80 cell at each chamber temperature.", MX + leftW + 18, y, rightW);
    y = doc.y + 6;
    {
      const shares = scoreShares(r, input.weights).filter((g) => g.part > 0);
      const ro = 60, ri = 39, cx = MX + ro + 2, cy = y + 6 + ro;
      donut(doc, cx, cy, ro, ri, shares.map((g) => ({ value: g.part, color: g.color })));
      doc.fillColor(GREY).font(F.semi).fontSize(5.5).text("WEIGHTED ERROR", cx - ri, cy - 12, { width: 2 * ri, align: "center", characterSpacing: 0.4 });
      doc.fillColor(INK).font(F.bold).fontSize(13).text(`${fmt(r.weightedError)} %`, cx - ri, cy - 5, { width: 2 * ri, align: "center" });
      let ly = y + 6;
      const lx = MX + 2 * ro + 16, lw = leftW - (2 * ro + 16);
      for (const g of shares) {
        doc.rect(lx, ly + 1.5, 7, 7).fill(g.color);
        doc.fillColor(INK).font(F.semi).fontSize(7.5);
        doc.text(fit(g.short, lw - 40), lx + 11, ly, { lineBreak: false });
        doc.text(`${Math.round(100 * g.share)} %`, lx + 11, ly, { width: lw - 11, align: "right", lineBreak: false });
        doc.fillColor(GREY).font(F.body).fontSize(6.3).text(g.items.map((i) => `T${i.test} ${fmt(i.rmse)}`).join(" · "), lx + 11, ly + 10, { width: lw - 11, lineGap: 0.5 });
        ly = doc.y + 6;
      }
      doc.fillColor(GREY_SOFT).font(F.body).fontSize(6.3).text("Figures are RMSE in % SOC; the share counts weight × RMSE.", MX, y + rowH - 12, { width: leftW });
    }
    const temps: [MetricKey, string][] = [["tempM20", "−20 °C"], ["tempM10", "−10 °C"], ["temp0", "0 °C"], ["temp10", "10 °C"], ["temp25", "25 °C"], ["temp40", "40 °C"]];
    barChart(doc, F, MX + leftW + 18, y, rightW, rowH - 16, temps.map(([k, l]) => ({ label: l, value: r[k] })));

    // ============================================================ page 2: scorecard
    newPage();
    section("Scorecard", `Every test case with its RMSE, the weight it carries and its contribution to the score. Weights ${input.weights ? "as configured by the benchmark administrators at the time of this report" : "follow the Blind Modeling Tool V2 specification"} and sum to 1; test 1 is weighted 0 because every other test is a subset of it.`);
    {
      const cols = { test: 26, name: 224, rmse: 54, weight: 54, part: 76, share: W - 26 - 224 - 54 - 54 - 76 };
      const x = { test: MX, name: MX + 26, rmse: MX + 250, weight: MX + 304, part: MX + 358, share: MX + 434 };
      const header = () => {
        doc.rect(MX, y, W, 16).fill(PANEL);
        label("Test", x.test + 4, y + 5, cols.test - 4);
        label("Test case", x.name, y + 5, cols.name);
        label("RMSE %", x.rmse, y + 5, cols.rmse - 6, "right");
        label("Weight", x.weight, y + 5, cols.weight - 6, "right");
        label("Weight × RMSE", x.part, y + 5, cols.part - 6, "right");
        label("Share", x.share + 6, y + 5, cols.share - 6);
        y += 16;
      };
      header();
      const parts = TEST_CASES.map((t) => weightOf(t.key) * (Number.isFinite(r[t.key]) ? r[t.key] : 0));
      const total = parts.reduce((a, b) => a + b, 0) || 1;
      const maxPart = Math.max(...parts, 0.0001);
      let lastGroup = "";
      const groupOf = (test: number) => (test <= 3 ? "Estimation accuracy" : test <= 9 ? "Operating conditions" : "Robustness");
      TEST_CASES.forEach((t, i) => {
        const g = groupOf(t.test);
        const head = g !== lastGroup;
        lastGroup = g;
        doc.font(F.body).fontSize(7);
        const descH = doc.heightOfString(t.description, { width: cols.name - 10 });
        const rowH = (head ? 11 : 0) + 11 + descH + 6;
        if (y + rowH > limit) {
          newPage();
          header();
        }
        if (head) {
          doc.fillColor(M).font(F.semi).fontSize(6.5).text(g.toUpperCase(), x.name, y + 4, { characterSpacing: 0.6, lineBreak: false });
        }
        const ty = y + (head ? 14 : 3);
        doc.fillColor(GREY).font(F.body).fontSize(8).text(String(t.test), x.test + 4, ty + 1, { width: cols.test - 4, lineBreak: false });
        doc.fillColor(INK).font(F.semi).fontSize(8.5).text(t.label, x.name, ty, { width: cols.name - 10, lineBreak: false });
        doc.fillColor(GREY).font(F.body).fontSize(7).text(t.description, x.name, ty + 11, { width: cols.name - 10 });
        const w = weightOf(t.key);
        doc.fillColor(w === 0 ? GREY_SOFT : INK).font(F.bodyBold).fontSize(8.5).text(fmt(r[t.key]), x.rmse, ty + 1, { width: cols.rmse - 6, align: "right", lineBreak: false });
        doc.fillColor(GREY).font(F.body).fontSize(8).text(w.toFixed(4), x.weight, ty + 1, { width: cols.weight - 6, align: "right", lineBreak: false });
        doc.fillColor(w === 0 ? GREY_SOFT : INK).font(F.body).fontSize(8).text(parts[i].toFixed(4), x.part, ty + 1, { width: cols.part - 6, align: "right", lineBreak: false });
        if (parts[i] > 0) {
          const bw = (cols.share - 40) * (parts[i] / maxPart);
          doc.roundedRect(x.share + 6, ty + 2, Math.max(1.5, bw), 6, 1.5).fill(M);
          doc.fillColor(GREY).font(F.body).fontSize(7).text(`${Math.round((100 * parts[i]) / total)} %`, x.share + 6 + bw + 4, ty + 1, { lineBreak: false });
        }
        y += rowH;
        doc.moveTo(MX, y).lineTo(MX + W, y).lineWidth(0.4).strokeColor(LINE).stroke();
      });
      ensure(22);
      doc.rect(MX, y, W, 20).fill(PANEL);
      doc.fillColor(INK).font(F.semi).fontSize(8.5).text("Weighted error = sum of (weight × RMSE)", x.name, y + 6, { lineBreak: false });
      doc.fillColor(M).font(F.bold).fontSize(9.5).text(`${fmt(total)} %`, x.part, y + 5, { width: cols.part - 6, align: "right", lineBreak: false });
      y += 20;
      doc.fillColor(GREY).font(F.body).fontSize(7.5).text(`Stored headline score ${fmt(r.weightedError, 3)} %${Math.abs(total - r.weightedError) > 0.002 ? ": it differs from the sum above because the weights changed after this score was stored (see the score history)." : ", matching the sum above to rounding."}  Complexity ${r.complexity} ±${r.complexityUncertainty} on a 1–10 scale (${COMPLEXITY_LABELS[r.complexity] ?? "—"}) and max error ${fmt(r.maxError, 1)} % are reported but not scored.`, MX, y + 6, { width: W, lineGap: 1 });
      y = doc.y + 16;
    }

    // ============================================================ page 3: how the score is computed
    newPage();
    section("How the score is computed", "Definitions of every metric and the arithmetic behind the numbers in this report, so results can be checked by hand against the scorecard.");
    {
      const colW = (W - 20) / 2;
      const col0Top = y;
      const paras: [string, string][] = [];
      const para = (title: string, body: string) => paras.push([title, body]);
      const flow = () => {
        doc.font(F.body).fontSize(8);
        const heights = paras.map(([, body]) => 13 + doc.heightOfString(body, { width: colW, lineGap: 1.2 }) + 9);
        const half = heights.reduce((a, b) => a + b, 0) / 2;
        let col = 0, cy = col0Top, acc = 0, colEnd = col0Top;
        paras.forEach(([title, body], i) => {
          if (col === 0 && acc >= half) {
            colEnd = cy;
            col = 1;
            cy = col0Top;
          }
          const x = MX + col * (colW + 20);
          doc.fillColor(INK).font(F.semi).fontSize(9).text(title, x, cy, { width: colW });
          doc.fillColor(GREY).font(F.body).fontSize(8).text(body, x, doc.y + 1, { width: colW, lineGap: 1.2 });
          cy = doc.y + 9;
          acc += heights[i];
        });
        return Math.max(cy, colEnd);
      };
      para("Model interface", "The model is called once per measured sample, in order, with X = [current (A), voltage (V), temperature (°C)] and its own state from the previous call; it returns the SOC estimate for that sample (0–1) and the updated state. Every cycle is preceded by one hour of rest at constant conditions so stateful models can settle; that hour is excluded from all metrics.");
      para("Per-cycle errors", "For each blinded drive cycle the estimate is compared with the reference SOC measured in the laboratory: RMSE = sqrt(mean((SOC_est − SOC_ref)²)), MAE = mean(|SOC_est − SOC_ref|) and max error = max(|SOC_est − SOC_ref|), all in % SOC over the samples of that cycle. The appendix lists all three for every cycle.");
      para("Tests 1–8: accuracy and operating conditions", "Each test case is the arithmetic mean of the per-cycle RMSE values of the cycles that belong to it: all cells; the blinded m448 cell; the three non-blinded cells; the charging profiles; the m80 / m448 / m448-N / m1000 payload conditions; the standard UDDS, HWFET, LA92 and US06 cycles; the non-standard HWCUST and HWGRADE cycles.");
      para("Test 9: temperature", "For the m80 cell, the mean per-cycle RMSE at each chamber temperature (−20, −10, 0, 10, 25 and 40 °C) is reported as six separate entries, each with one sixth of the test's weight.");
      para("Test 10: initial-SOC error", "Three blinded cycles are re-run with the model started at a wrong initial SOC of 90 %, 60 % and 30 % instead of 100 %. The nine RMSE values are averaged with weights 3 : 2 : 1 for the 90 / 60 / 30 % starts, so the smaller, more realistic offsets count more.");
      para("Test 11: current-sensor offset", "Blinded cycles are re-run with a constant offset added to the measured current (±0.05, ±0.1 and ±0.3 A). The test value is the mean RMSE of the runs that count towards the score, the ±0.1 A and ±0.3 A cases.");
      para("Weighted error", `The leaderboard score is the sum over the test cases of weight × RMSE. Test 1 (all cells) carries weight 0 because every other test is a subset of it. The weights sum to 1 and were ${input.weights ? "set by the benchmark administrators; the site's change log records every change." : "published with the Blind Modeling Tool V2."}`);
      para("Complexity", "Wall-clock time per sample of the model divided by the time per sample of a plain coulomb counter measured on the same machine, placed into one of ten bins one third of a decade wide. Informational; it does not enter the weighted error.");
      para("Max error", "The largest instantaneous |SOC_est − SOC_ref| over every blinded cycle. Informational; it does not enter the weighted error.");
      y = flow() + 10;
    }
    // score history
    const hist = input.history ?? [];
    if (hist.length > 1) {
      const hc = [104, 150, 60, W - 104 - 150 - 60];
      const hx = [MX, MX + hc[0], MX + hc[0] + hc[1], MX + hc[0] + hc[1] + hc[2]];
      const hHeader = () => {
        doc.rect(MX, y, W, 16).fill(PANEL);
        ["When", "Event", "Score", "Note"].forEach((h, i) => label(h, hx[i] + 4, y + 5, hc[i] - 8, i === 2 ? "right" : "left"));
        y += 16;
      };
      doc.font(F.body).fontSize(7.5);
      const needed = 62 + hist.slice(0, 6).reduce((a, h) => a + Math.max(14, doc.heightOfString(h.note ?? "", { width: hc[3] - 8 }) + 6), 0);
      ensure(needed);
      section("Score history", "Every evaluation, re-evaluation and re-score of this submission; the current score is the last row.");
      hHeader();
      const KIND: Record<string, string> = { evaluation: "Evaluated", failure: "Failed", rescore: "Re-scored", reevaluation: "Re-evaluated", cancelled: "Cancelled" };
      for (const h of hist) {
        doc.font(F.body).fontSize(7.5);
        const rowH = Math.max(14, doc.heightOfString(h.note ?? "", { width: hc[3] - 8 }) + 6);
        if (y + rowH > limit) {
          newPage();
          hHeader();
        }
        doc.fillColor(GREY).font(F.body).fontSize(7.5).text(date(h.createdAt), hx[0] + 4, y + 4, { width: hc[0] - 8 });
        doc.fillColor(INK).font(F.semi).fontSize(7.5);
        doc.text(fit(`${KIND[h.kind] ?? h.kind} · ${h.evaluatorVersion.split("/")[0]}`, hc[1] - 8), hx[1] + 4, y + 4, { lineBreak: false });
        doc.fillColor(INK).font(F.bodyBold).fontSize(7.5).text(h.weightedError === null ? "—" : `${fmt(h.weightedError)} %`, hx[2], y + 4, { width: hc[2] - 4, align: "right", lineBreak: false });
        doc.fillColor(GREY).font(F.body).fontSize(7.5).text(h.note ?? "", hx[3] + 4, y + 4, { width: hc[3] - 8 });
        y += rowH;
        doc.moveTo(MX, y).lineTo(MX + W, y).lineWidth(0.4).strokeColor(LINE).stroke();
      }
    }


    // ============================================================ page 4: every cycle at a glance
    newPage();
    section("All blinded cycles at a glance", `RMSE (% SOC) of every one of the ${r.perCycle.length} blinded drive cycles, one grid per cell: rows are chamber temperatures, columns are drive cycles. Darker is worse; the shade is scaled to this submission's largest per-cycle RMSE.`);
    heatGrids(doc, F, MX, y, W, r.perCycle);

    // ============================================================ time-domain traces
    const cycleTraces = r.timeSeries.filter((t) => (t.group ?? "cycle") === "cycle");
    const robust = r.timeSeries.filter((t) => t.group === "initialSoc" || t.group === "offset");
    const traceGrid = (list: TimeSeriesTrace[], title: string, sub: string) => {
      const colW = (W - 16) / 2, cellH = 150;
      let first = true;
      for (let start = 0; start < list.length; start += 8) {
        newPage();
        if (first) {
          section(title, sub);
          legendLine(doc, F, MX, y);
          y += 14;
          first = false;
        }
        list.slice(start, start + 8).forEach((tr, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          lineChart(doc, F, MX + col * (colW + 16), y + row * (cellH + 14), colW, cellH, tr);
        });
      }
    };
    traceGrid(cycleTraces, "Time-domain results", "Estimated against reference SOC on representative blinded cycles (down-sampled). For the blinded cell (m448) the reference SOC is never released, so its panels show the estimation error instead. One hour of padding precedes every cycle and is excluded from the metrics.");
    traceGrid(robust, "Robustness cases", "Test 10: cycles restarted from a wrong initial SOC (90, 60 and 30 %). Test 11: cycles with a constant current-sensor offset (±0.3 A shown). Estimated against reference SOC, down-sampled.");

    // ============================================================ appendix: per-cycle table, two columns per page
    newPage();
    section("Appendix: per-cycle errors", `All ${r.perCycle.length} blinded drive cycles: RMSE, MAE and maximum error in % SOC, with the cycle duration. Sorted by cell, temperature and cycle.`);
    {
      const rows = [...r.perCycle].sort((a, b) => cellRank(a.cell) - cellRank(b.cell) || a.temperatureC - b.temperatureC || a.cycle.localeCompare(b.cycle));
      const halfW = (W - 16) / 2;
      const pc = [38, 34, 50, 36, halfW - 38 - 34 - 50 - 36 - 2 * 29, 29, 29];
      const heads = ["Cell", "Temp", "Cycle", "Hours", "RMSE", "MAE", "Max"];
      const rowH = 11;
      const header = (x: number, yy: number) => {
        doc.rect(x, yy, halfW, 14).fill(PANEL);
        let cx = x;
        heads.forEach((h, i) => {
          label(h, cx + 3, yy + 4, pc[i] - 6, i >= 3 ? "right" : "left");
          cx += pc[i];
        });
      };
      const perCol = Math.floor((limit - y - 14) / rowH);
      let idx = 0;
      while (idx < rows.length) {
        if (idx > 0) {
          newPage();
        }
        const top = y;
        for (let col = 0; col < 2 && idx < rows.length; col++) {
          const x = MX + col * (halfW + 16);
          header(x, top);
          let yy = top + 14;
          for (let k = 0; k < perCol && idx < rows.length; k++, idx++) {
            const row = rows[idx];
            if (k % 2 === 1) doc.rect(x, yy, halfW, rowH).fill("#FBFBFC");
            const vals = [row.cell, `${row.temperatureC} °C`, row.cycle, row.durationH.toFixed(1), fmt(row.rmse), fmt(row.mae), fmt(row.maxErr)];
            let cx = x;
            vals.forEach((v, i) => {
              doc.fillColor(i === 4 ? INK : GREY).font(i === 4 ? F.bodyBold : F.body).fontSize(7).text(v, cx + 3, yy + 2.5, { width: pc[i] - 6, align: i >= 3 ? "right" : "left", lineBreak: false });
              cx += pc[i];
            });
            yy += rowH;
          }
          doc.moveTo(x, yy).lineTo(x + halfW, yy).lineWidth(0.4).strokeColor(LINE).stroke();
        }
      }
    }

    // ============================================================ running header + footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      if (i > range.start) {
        doc.rect(0, 0, PAGE_W, 4).fill(M);
        doc.fillColor(GREY_SOFT).font(F.body).fontSize(7).text(fit(`${s.modelName}  ·  Submission #${s.seq}`, W - 130), MX, 18, { lineBreak: false });
        doc.fillColor(GREY_SOFT).font(F.semi).fontSize(7).text("BATTERY SOC BENCHMARK", MX, 18, { width: W, align: "right", lineBreak: false, characterSpacing: 0.8 });
      }
      doc.moveTo(MX, PAGE_H - 40).lineTo(MX + W, PAGE_H - 40).lineWidth(0.4).strokeColor(LINE).stroke();
      doc.fillColor(GREY).font(F.body).fontSize(6.8);
      doc.text(`${siteUrl}/submissions/${s.id}`, MX, PAGE_H - 34, { width: W - 40, lineBreak: false });
      doc.text("Cite: P. J. Kollmeyer, M. Naguib, F. Khanum and A. Emadi, IEEE ITEC 2022, doi:10.1109/ITEC53557.2022.9813996", MX, PAGE_H - 25, { width: W - 40, lineBreak: false });
      doc.text("Developed by Dr. Phillip Kollmeyer's battery research group, McMaster University. Supported by NSERC Discovery Grant RGPIN-2024-06796.", MX, PAGE_H - 16, { width: W - 40, lineBreak: false });
      doc.fillColor(INK).font(F.semi).fontSize(7.5).text(`${i - range.start + 1} / ${range.count}`, MX, PAGE_H - 34, { width: W, align: "right", lineBreak: false });
    }
    doc.end();
  });
}

type Fonts = ReturnType<typeof fonts>;

function chartTitle(doc: Doc, F: Fonts, title: string, sub: string, x: number, y: number, w: number) {
  doc.fillColor(INK).font(F.semi).fontSize(10).text(title, x, y, { width: w });
  doc.fillColor(GREY).font(F.body).fontSize(7.5).text(sub, x, doc.y, { width: w, lineGap: 0.5 });
}

function legendLine(doc: Doc, F: Fonts, x: number, y: number) {
  doc.rect(x, y + 3.5, 12, 1.6).fill(INK);
  doc.fillColor(GREY).font(F.body).fontSize(7).text("Reference SOC", x + 16, y, { lineBreak: false });
  doc.rect(x + 86, y + 3.5, 12, 1.6).fill(EST);
  doc.fillColor(GREY).text("Estimated SOC", x + 102, y, { lineBreak: false });
  doc.fillColor(GREY_SOFT).text("Blinded cell (m448): estimation error, estimated − reference", x + 176, y, { lineBreak: false });
}

function barChart(doc: Doc, F: Fonts, x: number, y: number, w: number, h: number, allBars: { label: string; value: number | null | undefined; muted?: boolean }[]) {
  // legacy entries carry only the headline figures: a missing test case gets no bar rather than a crash
  const bars = allBars.flatMap((b) => (typeof b.value === "number" && Number.isFinite(b.value) ? [{ label: b.label, value: b.value, muted: !!b.muted }] : []));
  if (!bars.length) return;
  const twoLine = bars.some((b) => b.label.includes("\n"));
  const padL = 30, padB = twoLine ? 24 : 14, padT = 12;
  const rawMax = Math.max(...bars.map((b) => b.value), 0.01);
  const step = niceStep(rawMax * 1.12, 4);
  const max = Math.ceil((rawMax * 1.12) / step) * step;
  const plotW = w - padL, plotH = h - padB - padT;
  for (let v = 0; v <= max + 1e-9; v += step) {
    const gy = y + padT + plotH - (plotH * v) / max;
    doc.moveTo(x + padL, gy).lineTo(x + w, gy).lineWidth(0.4).strokeColor(v === 0 ? "#C9CDCF" : "#E8EAEB").stroke();
    doc.fillColor(GREY).font(F.body).fontSize(6.5).text(`${trimNum(v)} %`, x, gy - 3.5, { width: padL - 5, align: "right", lineBreak: false });
  }
  const slot = plotW / bars.length;
  const bw = Math.min(26, slot * 0.58);
  bars.forEach((b, i) => {
    const bh = (b.value / max) * plotH;
    const bx = x + padL + i * slot + (slot - bw) / 2;
    const by = y + padT + plotH - bh;
    doc.roundedRect(bx, by, bw, bh, 2).fill(b.muted ? "#ca99b1" : M);
    doc.fillColor(INK).font(F.body).fontSize(6.8).text(b.value.toFixed(2), bx - 8, by - 9, { width: bw + 16, align: "center", lineBreak: false });
    doc.fillColor(GREY).font(F.body).fontSize(6.3).text(b.label, x + padL + i * slot + 1, y + padT + plotH + 4, { width: slot - 2, align: "center", lineGap: -0.5 });
  });
}

/** A donut from SVG arc paths; slices are drawn clockwise from 12 o'clock. */
function donut(doc: Doc, cx: number, cy: number, ro: number, ri: number, slices: { value: number; color: string }[]) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const gap = 0.025; // radians of white between slices
  let a = -Math.PI / 2;
  const pt = (r: number, ang: number) => `${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`;
  for (const sl of slices) {
    const span = (2 * Math.PI * sl.value) / total;
    if (span <= 0) continue;
    const a0 = a + (slices.length > 1 ? gap / 2 : 0), a1 = a + span - (slices.length > 1 ? gap / 2 : 0);
    if (span >= 2 * Math.PI - 1e-6) {
      doc.circle(cx, cy, ro).fill(sl.color);
      doc.circle(cx, cy, ri).fill("#ffffff");
    } else if (a1 > a0) {
      const large = a1 - a0 > Math.PI ? 1 : 0;
      doc.path(`M ${pt(ro, a0)} A ${ro} ${ro} 0 ${large} 1 ${pt(ro, a1)} L ${pt(ri, a1)} A ${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`).fill(sl.color);
    }
    a += span;
  }
}

const CELL_ORDER = ["m80", "m448", "m448-N", "m1000"];
const CYCLE_ORDER = ["UDDS", "HWFET", "LA92", "US06", "HWCUST", "HWGRADE"];
const cellRank = (c: string) => (CELL_ORDER.indexOf(c) === -1 ? 99 : CELL_ORDER.indexOf(c));
const cycleRank = (c: string) => (CYCLE_ORDER.indexOf(c) === -1 ? 99 : CYCLE_ORDER.indexOf(c));

/** One RMSE grid per cell (temperature × cycle), shaded on a single-hue ramp. Two per row. */
function heatGrids(doc: Doc, F: Fonts, x0: number, y0: number, w: number, rows: PerCycleRow[]) {
  if (!rows.length) return;
  const cells = Array.from(new Set(rows.map((r) => r.cell))).sort((a, b) => cellRank(a) - cellRank(b) || a.localeCompare(b));
  const temps = Array.from(new Set(rows.map((r) => r.temperatureC))).sort((a, b) => a - b);
  const cycles = Array.from(new Set(rows.map((r) => r.cycle))).sort((a, b) => cycleRank(a) - cycleRank(b) || a.localeCompare(b));
  const vmax = Math.max(...rows.map((r) => r.rmse), 0.01);
  const gridW = (w - 20) / 2, labelW = 34, headH = 12;
  const cw = (gridW - labelW) / cycles.length, ch = 17;
  const gridH = 22 + headH + temps.length * ch + 8;
  cells.forEach((cell, i) => {
    const gx = x0 + (i % 2) * (gridW + 20), gy = y0 + Math.floor(i / 2) * (gridH + 14);
    const mine = rows.filter((r) => r.cell === cell);
    const mean = mine.reduce((s, r) => s + r.rmse, 0) / Math.max(1, mine.length);
    doc.fillColor(INK).font(F.semi).fontSize(9.5).text(cell, gx, gy, { lineBreak: false });
    const nameW = doc.widthOfString(cell);
    doc.fillColor(GREY).font(F.body).fontSize(7.5).text(`mean RMSE ${mean.toFixed(2)} %${cell === "m448" ? "  ·  blinded cell" : ""}`, gx + nameW + 10, gy + 2, { lineBreak: false });
    const ty = gy + 22;
    cycles.forEach((cy, j) => doc.fillColor(GREY).font(F.semi).fontSize(6).text(cy, gx + labelW + j * cw, ty, { width: cw, align: "center", lineBreak: false, characterSpacing: 0.2 }));
    temps.forEach((t, k) => {
      const ry = ty + headH + k * ch;
      doc.fillColor(GREY).font(F.body).fontSize(7).text(`${t} °C`, gx, ry + 5, { width: labelW - 4, align: "right", lineBreak: false });
      cycles.forEach((cy, j) => {
        const row = mine.find((r) => r.temperatureC === t && r.cycle === cy);
        const cx = gx + labelW + j * cw;
        if (!row) {
          doc.rect(cx + 1, ry + 1, cw - 2, ch - 2).fill("#FBFBFC");
          return;
        }
        const idx = Math.min(RAMP.length - 1, Math.floor((row.rmse / vmax) * (RAMP.length - 0.001)));
        doc.rect(cx + 1, ry + 1, cw - 2, ch - 2).fill(RAMP[idx]);
        doc.fillColor(idx >= 5 ? "#ffffff" : INK).font(F.body).fontSize(7).text(row.rmse.toFixed(2), cx, ry + 5, { width: cw, align: "center", lineBreak: false });
      });
    });
  });
  // ramp legend under the grids
  const ly = y0 + Math.ceil(cells.length / 2) * (gridH + 14) + 2;
  const lw = 110, seg = lw / RAMP.length;
  RAMP.forEach((c, i) => doc.rect(x0 + i * seg, ly, seg, 7).fill(c));
  doc.fillColor(GREY).font(F.body).fontSize(6.5).text("0 %", x0, ly + 9, { lineBreak: false }).text(`${vmax.toFixed(1)} %`, x0 + lw - 30, ly + 9, { width: 30, align: "right", lineBreak: false });
  doc.fillColor(GREY).font(F.body).fontSize(6.5).text("RMSE per cycle, % SOC", x0 + lw + 8, ly, { lineBreak: false });
}

function lineChart(doc: Doc, F: Fonts, x: number, y: number, w: number, h: number, tr: TimeSeriesTrace) {
  const padL = 30, padB = 14, titleH = 24;
  // A blinded cell (m448) ships only the error curve: its true SOC is the answer key, so the report
  // plots error (estimated − actual) against a signed axis instead of the actual/estimated lines.
  const blinded = !!tr.blinded;
  const err = blinded ? (tr.error ?? []) : (tr.estimated ?? []).map((e, i) => e - (tr.actual?.[i] ?? 0));
  const rmse = err.length ? Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length) : 0;
  const maxE = err.length ? Math.max(...err.map((e) => Math.abs(e))) : 0;
  doc.fillColor(INK).font(F.semi).fontSize(8).text(fitTo(doc, tr.label, w), x, y, { lineBreak: false });
  doc.fillColor(GREY).font(F.body).fontSize(6.8).text(fitTo(doc, `RMSE ${rmse.toFixed(2)} %  ·  max ${maxE.toFixed(1)} %${blinded ? "  ·  error shown, reference withheld" : ""}`, w), x, y + 11, { lineBreak: false });
  const py = y + titleH, plotH = h - titleH - padB, plotW = w - padL;
  const tMax = tr.t[tr.t.length - 1] || 1;
  const px = (t: number) => x + padL + (t / tMax) * plotW;
  doc.rect(x + padL, py, plotW, plotH).fill("#FDFDFD");
  if (blinded) {
    const m = Math.max(0.5, maxE) * 1.15;
    for (let i = 0; i <= 4; i++) {
      const gy = py + (plotH * i) / 4;
      const v = m - (2 * m * i) / 4;
      doc.moveTo(x + padL, gy).lineTo(x + w, gy).lineWidth(0.4).strokeColor(Math.abs(v) < 1e-9 ? "#B5BBBF" : "#E8EAEB").stroke();
      doc.fillColor(GREY).font(F.body).fontSize(6.2).text(`${v > 0 ? "+" : ""}${v.toFixed(1)} %`, x, gy - 3.5, { width: padL - 4, align: "right", lineBreak: false });
    }
    const pye = (v: number) => py + plotH / 2 - (Math.max(-m, Math.min(m, v)) / m) * (plotH / 2);
    doc.moveTo(px(tr.t[0]), pye(err[0] ?? 0));
    for (let i = 1; i < err.length; i++) doc.lineTo(px(tr.t[i]), pye(err[i]));
    doc.lineWidth(0.9).strokeColor(EST).stroke();
  } else {
    const pyv = (v: number) => py + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
    for (let i = 0; i <= 4; i++) {
      const gy = py + plotH - (plotH * i) / 4;
      doc.moveTo(x + padL, gy).lineTo(x + w, gy).lineWidth(0.4).strokeColor(i === 0 ? "#B5BBBF" : "#E8EAEB").stroke();
      doc.fillColor(GREY).font(F.body).fontSize(6.2).text(`${i * 25} %`, x, gy - 3.5, { width: padL - 4, align: "right", lineBreak: false });
    }
    const draw = (vals: number[], color: string, width: number) => {
      if (!vals.length) return;
      doc.moveTo(px(tr.t[0]), pyv(vals[0]));
      for (let i = 1; i < vals.length; i++) doc.lineTo(px(tr.t[i]), pyv(vals[i]));
      doc.lineWidth(width).strokeColor(color).stroke();
    };
    draw(tr.actual ?? [], INK, 1.1);
    draw(tr.estimated ?? [], EST, 0.9);
  }
  doc.fillColor(GREY).font(F.body).fontSize(6.2).text("0 h", x + padL, py + plotH + 4, { lineBreak: false });
  doc.text(`${tMax.toFixed(1)} h`, x + w - 30, py + plotH + 4, { width: 30, align: "right", lineBreak: false });
}

/** Trim a string to one line of the current font at width w, with an ellipsis (pdfkit wraps regardless of lineBreak). */
function fitTo(doc: Doc, text: string, w: number) {
  if (doc.widthOfString(text) <= w) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + "\u2026") > w) t = t.slice(0, -1);
  return t.trimEnd() + "\u2026";
}

/** Tick step from the 1-2-5 series giving roughly `target` intervals over [0, max]. */
function niceStep(max: number, target: number) {
  const raw = max / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
const trimNum = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));

/** Replace characters outside WinAnsi (unsupported by the built-in Helvetica) with safe equivalents. */
function pdfSafe(s: string) {
  return s
    .replace(/−/g, "-") // minus sign
    .replace(/[Σ∑]/g, "sum")
    .replace(/ⱼ/g, "j")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/→/g, "->")
    .replace(/≈/g, "~")
    .replace(/[  -​ ]/g, " ") // exotic spaces
    .replace(/[^ -ÿ–—‘’“”•…€™\n\t]/g, "?"); // anything else WinAnsi lacks
}
