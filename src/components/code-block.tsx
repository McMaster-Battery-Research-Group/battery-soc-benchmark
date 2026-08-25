"use client";

import * as React from "react";
import { Check, Copy, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Code block with filename tab, copy button, line numbers and a tiny MATLAB
 * tokenizer (no external highlighter dependency). Colours are chosen to sit
 * on the grey-900 surface with ≥4.5:1 contrast.
 */
const KEYWORDS = new Set(["function", "end", "if", "elseif", "else", "for", "while", "return", "break", "continue", "switch", "case", "otherwise", "try", "catch", "nargin", "nargout", "true", "false"]);
const BUILTINS = new Set(["zeros", "ones", "eye", "size", "length", "numel", "interp1", "load", "max", "min", "abs", "exp", "tanh", "diag", "repmat", "mean", "sqrt", "isnan", "bsxfun", "struct", "cell", "sum"]);

type Tok = { t: "kw" | "fn" | "num" | "str" | "cm" | "op" | "id" | "ws"; v: string };

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "%") {
      out.push({ t: "cm", v: line.slice(i) });
      break;
    }
    if (ch === "'" && (i === 0 || /[\s(,=\[+\-*/]/.test(line[i - 1]))) {
      let j = i + 1;
      while (j < line.length && line[j] !== "'") j++;
      out.push({ t: "str", v: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/\s/.test(ch)) {
      let j = i;
      while (j < line.length && /\s/.test(line[j])) j++;
      out.push({ t: "ws", v: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(line[i + 1] ?? ""))) {
      let j = i;
      while (j < line.length && /[0-9.eE]/.test(line[j])) j++;
      out.push({ t: "num", v: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const w = line.slice(i, j);
      out.push({ t: KEYWORDS.has(w) ? "kw" : BUILTINS.has(w) && line[j] === "(" ? "fn" : "id", v: w });
      i = j;
      continue;
    }
    out.push({ t: "op", v: ch });
    i++;
  }
  return out;
}

const COLORS: Record<Tok["t"], string> = {
  kw: "#fdbf57",
  fn: "#8fd3ff",
  num: "#f8b4c8",
  str: "#b5e3b5",
  cm: "#9aa5ad",
  op: "#e6e9ea",
  id: "#ffffff",
  ws: "inherit",
};

export function CodeBlock({
  code,
  filename,
  language = "matlab",
  className,
  collapsible = false,
  maxLines = 40,
}: {
  code: string;
  filename?: string;
  language?: "matlab" | "text";
  className?: string;
  collapsible?: boolean;
  maxLines?: number;
}) {
  const [copied, setCopied] = React.useState(false);
  const [expanded, setExpanded] = React.useState(!collapsible);
  const lines = code.replace(/\s+$/, "").split("\n");
  const shown = expanded ? lines : lines.slice(0, maxLines);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  return (
    <div className={cn("overflow-hidden rounded-brand border border-grey-800 bg-grey-900 text-[12.5px] leading-[1.55]", className)}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-3 py-1.5">
        <FileCode2 className="size-3.5 text-gold" />
        <span className="font-mono text-xs text-white/85">{filename ?? (language === "matlab" ? "Model.m" : "code")}</span>
        <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/60">{language}</span>
        <button onClick={copy} className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white" aria-live="polite">
          {copied ? <Check className="size-3.5 text-cootes" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="m-0 py-3 font-mono">
          {shown.map((ln, i) => (
            <div key={i} className="flex">
              <span className="w-10 shrink-0 select-none pr-3 text-right text-white/35">{i + 1}</span>
              <code className="flex-1 pr-4 whitespace-pre">
                {language === "matlab" ? tokenize(ln).map((tk, k) => <span key={k} style={{ color: COLORS[tk.t], fontStyle: tk.t === "cm" ? "italic" : undefined }}>{tk.v}</span>) : ln}
              </code>
            </div>
          ))}
        </pre>
      </div>
      {collapsible && lines.length > maxLines ? (
        <button onClick={() => setExpanded((v) => !v)} className="w-full border-t border-white/10 bg-black/20 py-2 text-xs text-white/80 hover:bg-white/10">
          {expanded ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      ) : null}
    </div>
  );
}
