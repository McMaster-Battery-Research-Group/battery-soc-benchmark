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

  // Untrusted archive hygiene (mirrors safe_extract in evaluator/python/socbench_eval/__main__.py):
  // no path traversal / absolute paths / symlinks, bounded entry count and uncompressed size, no zip bombs.
  const MAX_ENTRIES = 500, MAX_TOTAL = 512 * 1024 * 1024, MAX_ENTRY = 256 * 1024 * 1024, MAX_RATIO = 200;
  if (entries.length > MAX_ENTRIES) problems.push(`The archive has ${entries.length} entries; at most ${MAX_ENTRIES} are allowed.`);
  let total = 0;
  for (const e of entries) {
    const n = e.entryName.replace(/\\/g, "/");
    if (n.startsWith("/") || /^[A-Za-z]:/.test(n) || n.split("/").includes("..")) problems.push(`Unsafe path in archive: "${e.entryName}".`);
    if (((e.header.attr >>> 16) & 0o170000) === 0o120000) problems.push(`Symbolic links are not allowed in the package ("${e.entryName}").`);
    const size = e.header.size, comp = e.header.compressedSize || 1;
    if (size > MAX_ENTRY) problems.push(`"${e.entryName}" is larger than ${MAX_ENTRY / 1048576} MB uncompressed.`);
    if (size / comp > MAX_RATIO && size > 1024 * 1024) problems.push(`"${e.entryName}" has an implausible compression ratio; the package was rejected.`);
    total += size;
  }
  if (total > MAX_TOTAL) problems.push(`The package exceeds ${MAX_TOTAL / 1048576} MB uncompressed.`);
  if (problems.length) return { ok: false, problems, warnings, files };

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

