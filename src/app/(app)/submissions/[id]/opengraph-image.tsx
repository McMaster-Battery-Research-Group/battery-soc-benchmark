import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "Battery SOC Benchmark result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link-preview card for a submission. Private/hidden submissions get the generic card — this route is public. */
export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sub = await db.submission.findUnique({ where: { id }, include: { user: { select: { name: true } }, result: { select: { weightedError: true } } } }).catch(() => null);
  const show = sub && !sub.isPrivate && !sub.isHidden;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#7a003c", color: "#fff", padding: 64, fontFamily: "Arial" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 46, height: 26, border: "4px solid #fdbf57", borderRadius: 6, display: "flex", alignItems: "center", padding: 3 }}>
            <div style={{ width: 22, height: 12, background: "#fdbf57", borderRadius: 2 }} />
          </div>
          Battery SOC Benchmark
        </div>
        {show ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.1 }}>{sub.modelName}</div>
            <div style={{ fontSize: 30, color: "#fff", opacity: 0.9 }}>by {sub.user.name}</div>
            {sub.result ? <div style={{ fontSize: 40, color: "#fdbf57", fontWeight: 700 }}>{sub.result.weightedError.toFixed(3)} % weighted error</div> : <div style={{ fontSize: 30, color: "#fdbf57" }}>Blinded evaluation in progress</div>}
          </div>
        ) : (
          <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.1 }}>A blinded SOC estimation result</div>
        )}
        <div style={{ fontSize: 24, opacity: 0.85 }}>McMaster University · blinded evaluation on 144 drive cycles + robustness tests</div>
      </div>
    ),
    size,
  );
}
