/**
 * Chart palette. Validated with the dataviz palette validator (light surface):
 * lightness band, chroma floor, CVD separation, normal-vision floor all PASS.
 * Series 3 (#c98a2e, gold-derived) sits below 3:1 contrast vs white, so every
 * chart that uses it also carries direct labels / tooltips and a table view.
 *
 * Hues are derived from the McMaster palette: maroon first (always the most
 * prominent), then a Bayfront-blue, Heritage-gold, Pier-4-purple and
 * King's-Forest-green step re-stepped into the validated band.
 */
export const SERIES = ["#8f2555", "#1f7fb5", "#c98a2e", "#6b62b8", "#3f8f5a"] as const;

export const CHART = {
  primary: "#7a003c", // single-series bars (maroon)
  primarySoft: "#ca99b1",
  actual: "#1d2428", // reference / ground-truth line
  estimated: "#7a003c",
  band: "#f2e5eb",
  grid: "#e8eaeb",
  axis: "#929ba3",
  text: "#495965",
  textStrong: "#1d2428",
  highlight: "#fdbf57",
};

/** Sequential single-hue ramp (maroon) for heat-map style cells: light → dark */
export const SEQUENTIAL = ["#faf3f6", "#f2e5eb", "#e4ccd8", "#ca99b1", "#af6689", "#953363", "#7a003c", "#620030"] as const;

export function seriesColor(i: number) {
  return SERIES[Math.min(i, SERIES.length - 1)];
}
