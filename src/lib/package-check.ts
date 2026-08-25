import AdmZip from "adm-zip";

/**
 * Structural validation of a submission package, mirroring the checks in the
 * lab's "Model Submission Test Tool" (Blind Modeling Tool V2, User's Guide steps 2–4):
 *   - plain .zip, no sub-folders
 *   - contains Model.m, Model.p or Model.py
 * Returns human-readable problems (empty array = OK).
 */
export interface PackageCheck {
  ok: boolean;
  problems: string[];
  warnings: string[];
  files: string[];
  modelFile?: "Model.m" | "Model.p" | "Model.py";
}

export function checkSubmissionPackage(bytes: Buffer): PackageCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  let zip: AdmZip;
  try {
    zip = new AdmZip(bytes);
  } catch {
    return { ok: false, problems: ["The file is not a valid .zip archive."], warnings, files: [] };
  }
  const entries = zip.getEntries().filter((e) => !e.entryName.startsWith("__MACOSX/") && !e.entryName.endsWith(".DS_Store"));
  const files = entries.map((e) => e.entryName);

  const nested = entries.filter((e) => e.entryName.includes("/"));
  if (nested.length) {
    problems.push(`The archive must not contain sub-folders. Found: ${nested.slice(0, 3).map((e) => e.entryName).join(", ")}${nested.length > 3 ? "…" : ""}. Zip the files directly, not the folder containing them.`);
  }

  const names = entries.map((e) => e.entryName);
  const modelFile = names.includes("Model.m") ? "Model.m" : names.includes("Model.p") ? "Model.p" : names.includes("Model.py") ? "Model.py" : undefined;
  if (!modelFile) {
    const near = names.find((n) => /^model\.(m|p|py)$/i.test(n));
    problems.push(near ? `Found "${near}" — the estimator must be named exactly "Model.m", "Model.p" or "Model.py" (case-sensitive).` : 'Missing "Model.m", "Model.p" or "Model.py". The SOC estimator function must be named Model.');
  }
  if (modelFile === "Model.m") {
    const src = zip.getEntry("Model.m")!.getData().toString("utf8");
    if (!/function\s*\[[^\]]*\]\s*=\s*Model\s*\(/.test(src)) {
      problems.push('Model.m must define "function [Y, z] = Model(X, z)".');
    }
    if (/\bload\s*\(/.test(src)) warnings.push('Model.m calls load(); this is allowed but the guidelines advise avoiding it to reduce runtime.');
  }

  if (modelFile === "Model.py") {
    const src = zip.getEntry("Model.py")!.getData().toString("utf8");
    if (!/^\s*def\s+Model\s*\(/m.test(src)) problems.push('Model.py must define "def Model(X, z=None)" returning (Y_est, z).');
    if (/^\s*(import|from)\s+(torch|tensorflow|keras|sklearn|jax)/m.test(src)) warnings.push("Model.py imports a deep-learning framework; the evaluator's Python environment provides numpy and scipy only — bundle weights and implement inference with numpy, or confirm the framework is installed on the evaluation host.");
  }
  return { ok: problems.length === 0, problems, warnings, files, modelFile };
}

