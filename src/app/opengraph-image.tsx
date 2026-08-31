import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Battery SOC Benchmark — McMaster University";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Site-wide link-preview card (Teams/Slack/LinkedIn/X). Per-submission pages have their own. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#7a003c", color: "#fff", padding: 64, fontFamily: "Arial" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 46, height: 26, border: "4px solid #fdbf57", borderRadius: 6, display: "flex", alignItems: "center", padding: 3 }}>
            <div style={{ width: 22, height: 12, background: "#fdbf57", borderRadius: 2 }} />
          </div>
          Battery SOC Benchmark
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.1 }}>The standardized benchmark for battery state-of-charge estimation</div>
          <div style={{ fontSize: 28, color: "#fdbf57" }}>Blinded evaluation · 144 drive cycles + robustness tests · −20 °C to 40 °C</div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.85 }}>McMaster University · Dr. Kollmeyer&apos;s battery research group</div>
      </div>
    ),
    size,
  );
}
