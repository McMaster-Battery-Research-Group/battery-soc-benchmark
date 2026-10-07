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
 * nserc.svg/png are NSERC's official *symbol* (the red NSERC/CRSNG block), which NSERC's
 * acknowledgement guidelines allow where the full signature would be too small; the PNG is
 * rendered from the SVG. mcmaster.svg / mcmaster-white.svg are McMaster's logo (crest and name) as
 * published on mcmaster.ca, cropped from the "Brighter World" lockup: a stand-in until Brand
 * Marketing supplies the official files. mcmaster.png is rendered from the SVG.
 */
export const LOGOS = {
  mcmaster: { svg: "/logos/mcmaster.svg", png: "/logos/mcmaster.png", alt: "McMaster University", href: "https://www.mcmaster.ca" },
  nserc: { svg: "/logos/nserc.svg", png: "/logos/nserc.png", alt: "Natural Sciences and Engineering Research Council of Canada (NSERC / CRSNG)", href: "https://www.nserc-crsng.gc.ca" },
} as const;

export const ACKNOWLEDGEMENT = "Developed by Dr. Phillip Kollmeyer's battery research group at McMaster University. This work was supported by Canada's Natural Sciences and Engineering Research Council (NSERC) Discovery Grant RGPIN-2024-06796.";

/** Absolute filesystem path of a raster logo if it has been supplied, else null. Server-side only. */
export function logoPngPath(key: keyof typeof LOGOS): string | null {
  const p = path.join(process.cwd(), "public", LOGOS[key].png);
  return existsSync(p) ? p : null;
}
