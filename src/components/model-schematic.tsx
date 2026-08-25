/**
 * Standardized visual "model card" for SOC estimators.
 * Every method family gets the same treatment: a schematic (circuit, network,
 * or block diagram) + the governing equation + the I/O contract, so models on
 * the leaderboard can be understood at a glance regardless of who wrote them.
 */
import { cn } from "@/lib/utils";
import { MathBlock } from "@/components/math";

export type ModelSpec =
  | { kind: "coulomb"; capacityAh?: number }
  | { kind: "ecm"; rcPairs: number; states?: string[]; filter: "EKF" | "UKF" | "none" }
  | { kind: "fnn"; layers: number[]; activation?: string; inputs?: string[]; window?: number }
  | { kind: "rnn"; cell: "LSTM" | "GRU" | "RNN"; units: number; inputs?: string[]; output?: string }
  | { kind: "transformer"; layers?: number; heads?: number; window?: number }
  | { kind: "physics"; model?: string; filter?: string }
  | { kind: "hybrid"; backbone?: string; correction?: string }
  | { kind: "generic" };

/** Default spec for a leaderboard model type when the author has not provided one. */
export function specForModelType(modelType: string): ModelSpec {
  switch (modelType) {
    case "COULOMB_COUNTER": return { kind: "coulomb" };
    case "EKF": return { kind: "ecm", rcPairs: 2, filter: "EKF" };
    case "UKF": return { kind: "ecm", rcPairs: 2, filter: "UKF" };
    case "FNN": return { kind: "fnn", layers: [3, 32, 32, 1], activation: "ReLU" };
    case "LSTM": return { kind: "rnn", cell: "LSTM", units: 32 };
    case "GRU": return { kind: "rnn", cell: "GRU", units: 32 };
    case "TRANSFORMER": return { kind: "transformer" };
    case "PHYSICS": return { kind: "physics" };
    case "HYBRID": return { kind: "hybrid" };
    default: return { kind: "generic" };
  }
}

const M = "#7A003C", G = "#FDBF57", GREY = "#495965", LINE = "#DBDBDD", INK = "#1d2428";
const f = { fontFamily: "Poppins, Arial, sans-serif" } as const;
const mono = { fontFamily: "ui-monospace, Menlo, monospace" } as const;

export function ModelSchematic({ spec, title, className, compact = false }: { spec: ModelSpec; title?: string; className?: string; compact?: boolean }) {
  const meta = describe(spec);
  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <p className="font-heading text-[15px] font-semibold text-ink">{title ?? meta.title}</p>
        <p className="text-xs text-grey-600">{meta.family}</p>
      </div>
      <div className={cn("grid gap-5 p-5", compact ? "" : "lg:grid-cols-[1.3fr_1fr]")}>
        <div className="min-w-0">{renderSvg(spec)}</div>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Governing equation</p>
            <div className="mt-1 rounded-brand bg-grey-100 px-3 py-2 text-[15px] text-ink">{meta.equation.map((tex, i) => <MathBlock key={i} tex={tex} />)}{meta.equationNote ? <p className="mt-1 text-xs text-grey-600">{meta.equationNote}</p> : null}</div>
          </div>
          <div>
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">State carried in z</p>
            <p className="mt-1 text-grey-800">{meta.state}</p>
          </div>
          <div>
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Uses</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(["Current", "Voltage", "Temperature"] as const).map((s) => (
                <span key={s} className={cn("rounded-full border px-2 py-0.5 text-xs", meta.uses.includes(s) ? "border-maroon-300 bg-maroon-100 text-maroon-800" : "border-border text-grey-500 line-through")}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function describe(s: ModelSpec): { title: string; family: string; equation: string[]; equationNote?: string; state: string; uses: ("Current" | "Voltage" | "Temperature")[] } {
  switch (s.kind) {
    case "coulomb":
      return { title: "Coulomb counter", family: "Open-loop current integration", equation: [String.raw`\mathrm{SOC}_k = \mathrm{SOC}_{k-1} + \frac{I_k\,\Delta t}{3600\, C_n}`], equationNote: s.capacityAh ? `C_n = ${s.capacityAh} Ah, Δt = 1 s` : "Δt = 1 s", state: "Previous SOC only.", uses: ["Current"] };
    case "ecm":
      return { title: `${s.rcPairs}RC equivalent circuit + ${s.filter === "none" ? "open loop" : s.filter}`, family: "Model-based state estimation", equation: [String.raw`V_t = \mathrm{OCV}(\mathrm{SOC}) - R_0 I - \sum_{i=1}^{${s.rcPairs}} V_{RC,i}`, String.raw`\dot V_{RC,i} = -\frac{V_{RC,i}}{R_i C_i} + \frac{I}{C_i}`, ...(s.filter !== "none" ? [String.raw`\hat{x}_k = \hat{x}_k^- + K_k\,(V_{\mathrm{meas}} - V_t)`] : [])], state: `${s.states?.join(", ") ?? `${s.rcPairs} RC voltages + SOC`}; covariance P; current ECM parameters.`, uses: ["Current", "Voltage", "Temperature"] };
    case "fnn":
      return { title: `Feedforward NN ${s.layers.join(" → ")}`, family: "Data-driven, non-recurrent", equation: [String.raw`\mathrm{SOC} = f_\theta\big(\operatorname{norm}([\bar I, \bar V, \bar T])\big)`, s.activation === "ReLU" ? String.raw`a_{l+1} = \max(0,\; W_l a_l + b_l)` : String.raw`a_{l+1} = \sigma(W_l a_l + b_l)`], equationNote: s.window ? `Inputs averaged over the last ${s.window} samples.` : undefined, state: s.window ? `Rolling window of the last ${s.window} samples.` : "None (stateless).", uses: ["Current", "Voltage", "Temperature"] };
    case "rnn":
      return { title: `${s.cell} · ${s.units} units`, family: "Data-driven, recurrent", equation: s.cell === "LSTM" ? [String.raw`i_t, f_t, o_t = \sigma(W x_t + U h_{t-1} + b)`, String.raw`c_t = f_t \odot c_{t-1} + i_t \odot \tanh(W_c x_t + U_c h_{t-1} + b_c)`, String.raw`h_t = o_t \odot \tanh(c_t), \qquad \mathrm{SOC} = \operatorname{clip}(w^\top h_t + b,\,0,\,1)`] : [String.raw`h_t = \mathrm{${s.cell}}(x_t, h_{t-1}), \qquad \mathrm{SOC} = w^\top h_t + b`], state: `Hidden state h (${s.units})${s.cell === "LSTM" ? ` and cell state c (${s.units})` : ""}.`, uses: ["Current", "Voltage", "Temperature"] };
    case "transformer":
      return { title: "Transformer encoder", family: "Data-driven, attention over a window", equation: [String.raw`\mathrm{SOC} = \mathrm{MLP}\big(\operatorname{Attn}(Q, K, V)\big), \quad \text{window of } ${s.window ?? "N"} \text{ samples}`], state: `Rolling window of the last ${s.window ?? "N"} samples.`, uses: ["Current", "Voltage", "Temperature"] };
    case "physics":
      return { title: s.model ?? "Electrochemical model", family: "Physics-based state estimation", equation: [String.raw`\frac{\partial c}{\partial t} = D\,\nabla^2 c`, String.raw`V = U_p(c_{s,p}) - U_n(c_{s,n}) - \eta - R\,I`], equationNote: s.filter ? `Corrected by ${s.filter}.` : undefined, state: "Electrode concentrations (discretised), filter covariance.", uses: ["Current", "Voltage", "Temperature"] };
    case "hybrid":
      return { title: "Hybrid estimator", family: `${s.backbone ?? "Model-based"} backbone + ${s.correction ?? "learned"} correction`, equation: [String.raw`\mathrm{SOC} = \mathrm{SOC}_{\text{backbone}} + g_\theta(I, V, T, \text{history})`], state: "Backbone state plus the correction model's memory.", uses: ["Current", "Voltage", "Temperature"] };
    default:
      return { title: "Estimator", family: "Unspecified", equation: [String.raw`[Y, z] = \mathrm{Model}(X, z)`], state: "As chosen by the author.", uses: ["Current", "Voltage", "Temperature"] };
  }
}

/* ---------- SVGs ---------- */

function renderSvg(s: ModelSpec) {
  switch (s.kind) {
    case "coulomb": return <CoulombSvg />;
    case "ecm": return <EcmSvg rc={s.rcPairs} filter={s.filter} />;
    case "fnn": return <FnnSvg layers={s.layers} inputs={s.inputs} />;
    case "rnn": return <RnnSvg cell={s.cell} units={s.units} />;
    case "transformer": return <BlockSvg blocks={["window", "attention", "MLP", "SOC"]} />;
    case "physics": return <BlockSvg blocks={["I, V, T", "electrochem. model", "filter", "SOC"]} />;
    case "hybrid": return <BlockSvg blocks={["I, V, T", "backbone", "+ correction", "SOC"]} />;
    default: return <BlockSvg blocks={["X = [I V T]", "Model(X, z)", "SOC"]} />;
  }
}

function CoulombSvg() {
  return (
    <svg viewBox="0 0 420 150" className="h-auto w-full" role="img" aria-label="Coulomb counter block diagram: current is integrated and divided by capacity to give SOC">
      <Box x={10} y={50} w={80} h={50} label="I(t)" sub="current" />
      <Arrow x1={92} y1={75} x2={130} y2={75} />
      <rect x="132" y="40" width="90" height="70" rx="4" fill={M} />
      <text x="177" y="70" textAnchor="middle" fontSize="26" fill="#fff" style={mono}>∫ dt</text>
      <text x="177" y="96" textAnchor="middle" fontSize="11" fill={G} style={f}>accumulate</text>
      <Arrow x1={224} y1={75} x2={262} y2={75} />
      <rect x="264" y="40" width="64" height="70" rx="4" fill="#fff" stroke={LINE} />
      <text x="296" y="70" textAnchor="middle" fontSize="16" fill={INK} style={mono}>÷ C</text>
      <text x="296" y="94" textAnchor="middle" fontSize="11" fill={GREY} style={f}>capacity</text>
      <Arrow x1={330} y1={75} x2={366} y2={75} />
      <Box x={368} y={50} w={44} h={50} label="SOC" filled />
      <path d="M 177 112 L 177 132 L 90 132 L 90 100" fill="none" stroke={M} strokeDasharray="4 3" />
      <text x="134" y="145" textAnchor="middle" fontSize="10" fill={M} style={f}>z = previous SOC</text>
      <text x="60" y="30" fontSize="10" fill={GREY} style={f}>V, T unused</text>
    </svg>
  );
}

function EcmSvg({ rc, filter }: { rc: number; filter: string }) {
  const n = Math.max(1, Math.min(rc, 3));
  const startX = 150;
  const step = 78;
  const endX = startX + n * step + 20;
  return (
    <svg viewBox={`0 0 ${endX + 90} 170`} className="h-auto w-full" role="img" aria-label={`${n}RC equivalent circuit model with ${filter} correction`}>
      {/* OCV source */}
      <circle cx="60" cy="70" r="18" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <text x="60" y="66" textAnchor="middle" fontSize="9" fill={INK} style={f}>OCV</text>
      <text x="60" y="77" textAnchor="middle" fontSize="8" fill={GREY} style={f}>(SOC,T)</text>
      <line x1="60" y1="88" x2="60" y2="130" stroke={INK} strokeWidth="1.5" />
      <line x1="60" y1="52" x2="60" y2="30" stroke={INK} strokeWidth="1.5" />
      <line x1="60" y1="30" x2="100" y2="30" stroke={INK} strokeWidth="1.5" />
      {/* R0 */}
      <rect x="100" y="22" width="40" height="16" fill="#fff" stroke={M} strokeWidth="1.5" />
      <text x="120" y="17" textAnchor="middle" fontSize="10" fill={M} style={f}>R₀</text>
      <line x1="140" y1="30" x2={startX} y2="30" stroke={INK} strokeWidth="1.5" />
      {/* RC pairs */}
      {Array.from({ length: n }).map((_, i) => {
        const x = startX + i * step;
        return (
          <g key={i}>
            <line x1={x} y1="30" x2={x} y2="10" stroke={INK} strokeWidth="1.5" />
            <line x1={x} y1="30" x2={x} y2="50" stroke={INK} strokeWidth="1.5" />
            <rect x={x + 8} y="2" width="44" height="16" fill="#fff" stroke={M} strokeWidth="1.5" />
            <text x={x + 30} y="14" textAnchor="middle" fontSize="9" fill={M} style={f}>R{i + 1}</text>
            <line x1={x} y1="10" x2={x + 8} y2="10" stroke={INK} strokeWidth="1.5" /><line x1={x + 52} y1="10" x2={x + 60} y2="10" stroke={INK} strokeWidth="1.5" />
            <line x1={x} y1="50" x2={x + 24} y2="50" stroke={INK} strokeWidth="1.5" /><line x1={x + 36} y1="50" x2={x + 60} y2="50" stroke={INK} strokeWidth="1.5" />
            <line x1={x + 24} y1="41" x2={x + 24} y2="59" stroke={INK} strokeWidth="2" /><line x1={x + 36} y1="41" x2={x + 36} y2="59" stroke={INK} strokeWidth="2" />
            <text x={x + 30} y="72" textAnchor="middle" fontSize="9" fill={GREY} style={f}>C{i + 1}</text>
            <line x1={x + 60} y1="10" x2={x + 60} y2="50" stroke={INK} strokeWidth="1.5" />
            <line x1={x + 60} y1="30" x2={x + step} y2="30" stroke={INK} strokeWidth="1.5" />
          </g>
        );
      })}
      {/* terminals */}
      <line x1={endX} y1="30" x2={endX} y2="130" stroke={INK} strokeWidth="1.5" />
      <line x1="60" y1="130" x2={endX} y2="130" stroke={INK} strokeWidth="1.5" />
      <circle cx={endX} cy="30" r="3" fill={INK} /><circle cx={endX} cy="130" r="3" fill={INK} />
      <text x={endX + 10} y="34" fontSize="11" fill={INK} style={f}>+</text>
      <text x={endX + 10} y="134" fontSize="11" fill={INK} style={f}>−</text>
      <text x={endX + 22} y="86" fontSize="12" fill={INK} style={f}>V<tspan fontSize="8" dy="3">t</tspan></text>
      <text x={endX - 40} y="150" textAnchor="middle" fontSize="10" fill={GREY} style={f}>I →</text>
      {/* filter badge */}
      {filter !== "none" ? (
        <g>
          <rect x="8" y="140" width="112" height="22" rx="11" fill={M} />
          <text x="64" y="155" textAnchor="middle" fontSize="10" fill="#fff" style={f}>{filter}: predict → correct</text>
        </g>
      ) : null}
    </svg>
  );
}

function FnnSvg({ layers, inputs }: { layers: number[]; inputs?: string[] }) {
  const W = 420, H = 170;
  const cols = layers.length;
  const xs = layers.map((_, i) => 40 + (i * (W - 80)) / (cols - 1));
  const shown = layers.map((n) => Math.min(n, 7));
  const ys = (k: number) => Array.from({ length: k }, (_, j) => 25 + (j * (H - 60)) / Math.max(1, k - 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Feedforward network with layers ${layers.join(", ")}`}>
      {shown.slice(0, -1).map((k, i) =>
        ys(k).map((y1, a) =>
          ys(shown[i + 1]).map((y2, b) => <line key={`${i}-${a}-${b}`} x1={xs[i]} y1={y1} x2={xs[i + 1]} y2={y2} stroke={LINE} strokeWidth="0.7" />),
        ),
      )}
      {shown.map((k, i) =>
        ys(k).map((y, j) => (
          <g key={`${i}-${j}`}>
            <circle cx={xs[i]} cy={y} r={i === 0 || i === cols - 1 ? 9 : 7} fill={i === 0 ? "#fff" : i === cols - 1 ? G : M} stroke={i === 0 ? GREY : "none"} strokeWidth="1.2" />
            {i === 0 && inputs?.[j] ? <text x={xs[i]} y={y + 3.5} textAnchor="middle" fontSize="9" fill={INK} style={f}>{inputs[j]}</text> : null}
            {i === cols - 1 ? <text x={xs[i]} y={y + 3.5} textAnchor="middle" fontSize="8" fill={INK} style={f}>SOC</text> : null}
          </g>
        )),
      )}
      {layers.map((n, i) => (
        <text key={i} x={xs[i]} y={H - 8} textAnchor="middle" fontSize="10" fill={GREY} style={f}>{i === 0 ? "inputs" : i === cols - 1 ? "output" : `${n} ${layers[i] > 7 ? "(7 shown)" : ""}`}</text>
      ))}
    </svg>
  );
}

function RnnSvg({ cell, units }: { cell: string; units: number }) {
  return (
    <svg viewBox="0 0 420 160" className="h-auto w-full" role="img" aria-label={`${cell} recurrent cell with ${units} units`}>
      <Box x={10} y={55} w={80} h={50} label="x_t" sub="[V, I, T]" />
      <Arrow x1={92} y1={80} x2={138} y2={80} />
      <rect x="140" y="30" width="150" height="100" rx="6" fill={M} />
      <text x="215" y="66" textAnchor="middle" fontSize="18" fontWeight="600" fill="#fff" style={f}>{cell}</text>
      <text x="215" y="86" textAnchor="middle" fontSize="11" fill={G} style={f}>{units} hidden units</text>
      {cell === "LSTM" ? <text x="215" y="106" textAnchor="middle" fontSize="10" fill="#fff" opacity="0.85" style={f}>gates: input · forget · cell · output</text> : <text x="215" y="106" textAnchor="middle" fontSize="10" fill="#fff" opacity="0.85" style={f}>gates: reset · update</text>}
      <Arrow x1={292} y1={80} x2={338} y2={80} />
      <rect x="340" y="55" width="70" height="50" rx="4" fill="#fff" stroke={LINE} />
      <text x="375" y="75" textAnchor="middle" fontSize="11" fill={INK} style={f}>dense</text>
      <text x="375" y="92" textAnchor="middle" fontSize="12" fontWeight="600" fill={M} style={f}>SOC</text>
      {/* recurrence */}
      <path d="M 260 132 L 260 150 L 170 150 L 170 132" fill="none" stroke={G} strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="215" y="146" textAnchor="middle" fontSize="10" fill={M} style={f}>h_{"{t−1}"}{cell === "LSTM" ? ", c_{t−1}" : ""} via z</text>
    </svg>
  );
}

function BlockSvg({ blocks }: { blocks: string[] }) {
  const w = 420, bw = (w - 20 - (blocks.length - 1) * 30) / blocks.length;
  return (
    <svg viewBox={`0 0 ${w} 90`} className="h-auto w-full" role="img" aria-label={blocks.join(" → ")}>
      {blocks.map((b, i) => {
        const x = 10 + i * (bw + 30);
        const last = i === blocks.length - 1;
        return (
          <g key={b}>
            <rect x={x} y="20" width={bw} height="50" rx="4" fill={last ? G : i === 0 ? "#fff" : M} stroke={i === 0 ? LINE : "none"} />
            <text x={x + bw / 2} y="49" textAnchor="middle" fontSize="11" fontWeight="600" fill={last || i === 0 ? INK : "#fff"} style={f}>{b}</text>
            {!last ? <Arrow x1={x + bw + 2} y1={45} x2={x + bw + 28} y2={45} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

function Box({ x, y, w, h, label, sub, filled }: { x: number; y: number; w: number; h: number; label: string; sub?: string; filled?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={filled ? G : "#fff"} stroke={filled ? G : LINE} />
      <text x={x + w / 2} y={y + (sub ? 22 : h / 2 + 5)} textAnchor="middle" fontSize="13" fontWeight="600" fill={INK} style={f}>{label}</text>
      {sub ? <text x={x + w / 2} y={y + 38} textAnchor="middle" fontSize="10" fill={GREY} style={f}>{sub}</text> : null}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - 6} y2={y2} stroke={GREY} strokeWidth="1.5" />
      <path d={`M ${x2 - 7} ${y2 - 4} L ${x2} ${y2} L ${x2 - 7} ${y2 + 4} z`} fill={GREY} />
    </g>
  );
}
