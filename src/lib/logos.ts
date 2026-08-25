import { existsSync } from "fs";
import path from "path";

/**
 * Institutional logos. The web pages use the SVGs in public/logos/. The PDF
 * report and HTML e-mails need raster files, so they look for optional PNGs
 * next to them (transparent background, ≥ 600 px wide):
 *
 *   public/logos/mcmaster.svg   public/logos/mcmaster.png
 *   public/logos/nserc.svg      public/logos/nserc.png
 *
 * Until the official assets are supplied the SVGs are text-only wordmarks and
 * the PNGs are absent — PDF and e-mails then fall back to a text
 * acknowledgement. Nothing else changes when the files are dropped in.
 */
export const LOGOS = {
  mcmaster: { svg: "/logos/mcmaster.svg", png: "/logos/mcmaster.png", alt: "McMaster University", href: "https://www.mcmaster.ca" },
  nserc: { svg: "/logos/nserc.svg", png: "/logos/nserc.png", alt: "Natural Sciences and Engineering Research Council of Canada (NSERC / CRSNG)", href: "https://www.nserc-crsng.gc.ca" },
} as const;

export const ACKNOWLEDGEMENT = "Developed by the McMaster Automotive Resource Centre at McMaster University with funding from the Natural Sciences and Engineering Research Council of Canada (NSERC).";

/** Absolute filesystem path of a raster logo if it has been supplied, else null. Server-side only. */
export function logoPngPath(key: keyof typeof LOGOS): string | null {
  const p = path.join(process.cwd(), "public", LOGOS[key].png);
  return existsSync(p) ? p : null;
}
