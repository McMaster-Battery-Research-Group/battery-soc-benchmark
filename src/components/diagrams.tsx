/**
 * Inline SVG explainer diagrams. Colours are brand tokens; text uses the page fonts.
 * Kept as plain SVG (no library) so they render server-side and print cleanly.
 */

const M = "#7A003C", G = "#FDBF57", GREY = "#495965", LINE = "#DBDBDD", INK = "#1d2428", SOFT = "#faf3f6";
const f = { fontFamily: "Poppins, Arial, sans-serif" } as const;
const body = { fontFamily: "Arial, sans-serif" } as const;

/** X = [I, V, T] → Model(X, z) → Y (SOC), with the memory z fed back. */
export function ModelLoopDiagram({ className }: { className?: string }) {
  return (
    <figure className={className}>
      <svg viewBox="0 0 760 230" role="img" aria-labelledby="mld-title" className="h-auto w-full">
        <title id="mld-title">Each second the evaluator passes current, voltage and temperature to Model, which returns an SOC estimate and its own memory z for the next call.</title>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={GREY} /></marker>
          <marker id="arrM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={M} /></marker>
        </defs>
        {/* sensors */}
        <rect x="20" y="55" width="170" height="110" rx="4" fill="#fff" stroke={LINE} />
        <text x="105" y="80" textAnchor="middle" fontSize="12" fontWeight="600" fill={M} style={f}>MEASUREMENTS  X</text>
        {[["Current", "A"], ["Voltage", "V"], ["Temperature", "°C"]].map(([l, u], i) => (
          <g key={l}>
            <circle cx="44" cy={101 + i * 22} r="4" fill={i === 0 ? M : i === 1 ? G : GREY} />
            <text x="56" y={105 + i * 22} fontSize="13" fill={INK} style={body}>{l}</text>
            <text x="176" y={105 + i * 22} fontSize="12" textAnchor="end" fill={GREY} style={body}>{u}</text>
          </g>
        ))}
        <text x="105" y="185" textAnchor="middle" fontSize="11" fill={GREY} style={body}>1 × 3 row, once per second</text>
        {/* arrow in */}
        <line x1="192" y1="110" x2="268" y2="110" stroke={GREY} strokeWidth="1.5" markerEnd="url(#arr)" />
        {/* model */}
        <rect x="272" y="60" width="216" height="100" rx="4" fill={M} />
        <text x="380" y="98" textAnchor="middle" fontSize="18" fontWeight="600" fill="#fff" style={f}>[Y, z] = Model(X, z)</text>
        <text x="380" y="122" textAnchor="middle" fontSize="12" fill={G} style={body}>your estimator — Model.m or Model.p</text>
        <text x="380" y="142" textAnchor="middle" fontSize="11" fill="#fff" opacity="0.8" style={body}>first call has no z: initialise here</text>
        {/* arrow out */}
        <line x1="490" y1="110" x2="566" y2="110" stroke={GREY} strokeWidth="1.5" markerEnd="url(#arr)" />
        {/* output */}
        <rect x="570" y="55" width="170" height="110" rx="4" fill="#fff" stroke={LINE} />
        <text x="655" y="80" textAnchor="middle" fontSize="12" fontWeight="600" fill={M} style={f}>ESTIMATE  Y</text>
        <text x="655" y="118" textAnchor="middle" fontSize="26" fontWeight="700" fill={INK} style={f}>SOC</text>
        <text x="655" y="140" textAnchor="middle" fontSize="12" fill={GREY} style={body}>0 … 1 (0–100 %)</text>
        <text x="655" y="185" textAnchor="middle" fontSize="11" fill={GREY} style={body}>compared with reference SOC</text>
        {/* z loop */}
        <path d="M 440 160 L 440 200 L 320 200 L 320 162" fill="none" stroke={M} strokeWidth="1.5" strokeDasharray="5 4" markerEnd="url(#arrM)" />
        <rect x="336" y="190" width="88" height="20" rx="3" fill={SOFT} />
        <text x="380" y="204" textAnchor="middle" fontSize="11" fill={M} style={body}>memory z → next call</text>
      </svg>
      <figcaption className="mt-2 text-xs text-grey-600">The evaluator mimics a battery management system: it never shows the model the future, only the current sample and whatever the model chose to remember.</figcaption>
    </figure>
  );
}

/** Open data → develop → submit → blinded evaluation → leaderboard. */
export function PipelineDiagram({ className }: { className?: string }) {
  const steps = [
    { t: "Open data", s: "3 cells · 6 temps · HPPC + drive cycles", fill: "#fff", stroke: LINE, text: INK },
    { t: "Your model", s: "filter, network or physics — any method", fill: "#fff", stroke: LINE, text: INK },
    { t: "Blinded evaluator", s: "hidden cell + hidden cycles + fault cases", fill: M, stroke: M, text: "#fff" },
    { t: "Leaderboard", s: "weighted error, 18 test cases, plots", fill: G, stroke: G, text: INK },
  ];
  return (
    <figure className={className}>
      <svg viewBox="0 0 760 150" role="img" aria-labelledby="pl-title" className="h-auto w-full">
        <title id="pl-title">Pipeline: download open data, build a model, submit it to the blinded evaluator, results appear on the leaderboard.</title>
        <defs><marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={GREY} /></marker></defs>
        {steps.map((st, i) => {
          const x = 10 + i * 190;
          return (
            <g key={st.t}>
              <rect x={x} y="30" width="160" height="90" rx="4" fill={st.fill} stroke={st.stroke} />
              <text x={x + 14} y="52" fontSize="11" fontWeight="600" fill={i === 2 ? G : M} style={f}>STEP {i + 1}</text>
              <text x={x + 14} y="76" fontSize="16" fontWeight="600" fill={st.text} style={f}>{st.t}</text>
              <foreignObject x={x + 14} y="84" width="136" height="34">
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, lineHeight: "14px", color: i === 2 ? "rgba(255,255,255,0.85)" : GREY }}>{st.s}</div>
              </foreignObject>
              {i < steps.length - 1 ? <line x1={x + 162} y1="75" x2={x + 188} y2="75" stroke={GREY} strokeWidth="1.5" markerEnd="url(#arr2)" /> : null}
            </g>
          );
        })}
        {/* blinded lock hint */}
        <text x="390" y="140" textAnchor="middle" fontSize="11" fill={GREY} style={body}>The dashed line is what you never see: the blinded data stays inside the evaluator.</text>
        <line x1="380" y1="20" x2="380" y2="126" stroke={M} strokeWidth="1" strokeDasharray="4 4" />
      </svg>
    </figure>
  );
}
