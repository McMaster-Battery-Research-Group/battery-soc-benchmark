import katex from "katex";
import { cn } from "@/lib/utils";

/**
 * LaTeX rendered server-side with KaTeX (no client JS). Import the KaTeX stylesheet once in the
 * root layout. Use <Math> for inline and <MathBlock> for display equations.
 */
export function Math({ tex, className }: { tex: string; className?: string }) {
  const html = katex.renderToString(tex, { throwOnError: false, output: "htmlAndMathml" });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MathBlock({ tex, className }: { tex: string; className?: string }) {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: true, output: "htmlAndMathml" });
  return <div className={cn("overflow-x-auto py-1", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
