import { Weight, Wind, EyeOff, ThermometerSnowflake, Thermometer, ThermometerSun, Route, Mountain, Zap, BatteryCharging, TrendingDown, Activity } from "lucide-react";
import { CELL_INFO } from "@/lib/test-cases";
import { cn } from "@/lib/utils";

/**
 * What a plotted run IS, as icon chips: payload (cell), temperature, drive-cycle type and, for the
 * robustness tests, which one. Every SOC trace looks like the next; the chips make the context
 * readable at a glance and the plot findable again from memory ("the cold one", "the 1000 kg one").
 * Icons rather than colour, so the convention does not have to be remembered.
 */
export type RunContext = { cell: string; cycle: string; temperatureC: number; group?: "cycle" | "initialSoc" | "offset" | string; blinded?: boolean };

const CYCLES: Record<string, { icon: React.ComponentType<{ className?: string }>; text: string }> = {
  UDDS: { icon: Route, text: "UDDS · urban, gentle" },
  LA92: { icon: Zap, text: "LA92 · urban, aggressive" },
  HWFET: { icon: Route, text: "HWFET · highway, standard" },
  US06: { icon: Zap, text: "US06 · highway, aggressive" },
  HWCUST: { icon: Route, text: "HWCUST · custom highway" },
  HWGRADE: { icon: Mountain, text: "HWGRADE · highway with grade" },
};

export function tempChip(t: number) {
  if (t <= -20) return { icon: ThermometerSnowflake, text: `${t} °C · coldest` };
  if (t < 0) return { icon: ThermometerSnowflake, text: `${t} °C · cold` };
  if (t === 0) return { icon: ThermometerSnowflake, text: "0 °C · freezing" };
  if (t <= 10) return { icon: Thermometer, text: `${t} °C · cool` };
  if (t <= 25) return { icon: Thermometer, text: `${t} °C · room temperature` };
  return { icon: ThermometerSun, text: `${t} °C · hottest` };
}

/** The six chamber temperatures as the same chips the plots use. */
export function TemperatureChips({ temps, className }: { temps: readonly number[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Chamber temperatures">
      {temps.map((t) => {
        const c = tempChip(t);
        return (
          <li key={t} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-grey-100/70 px-2.5 py-1 font-heading text-xs font-medium text-grey-800">
            <c.icon className="size-4 shrink-0 text-grey-600" aria-hidden /> {c.text}
          </li>
        );
      })}
    </ul>
  );
}

export function RunChips({ run, className, size = "sm" }: { run: RunContext; className?: string; size?: "sm" | "md" }) {
  const info = CELL_INFO[run.cell as keyof typeof CELL_INFO];
  const chips: { icon: React.ComponentType<{ className?: string }>; text: string; strong?: boolean }[] = [];
  if (info) chips.push({ icon: Weight, text: `${info.payloadKg} kg payload` });
  if (info && info.payloadKg === 448) chips.push({ icon: Wind, text: info.hvac ? "HVAC on" : "HVAC off" });
  if (run.blinded || info?.blind) chips.push({ icon: EyeOff, text: "blinded cell", strong: true });
  if (/charge/i.test(run.cycle)) chips.push({ icon: BatteryCharging, text: "CC-CV charge" });
  else chips.push(CYCLES[run.cycle] ?? { icon: Route, text: run.cycle });
  chips.push(tempChip(run.temperatureC));
  if (run.group === "initialSoc") chips.push({ icon: TrendingDown, text: "incorrect start · test 10", strong: true });
  if (run.group === "offset") chips.push({ icon: Activity, text: "sensor offset · test 11", strong: true });
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[0.6875rem]";
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="What this run is">
      {chips.map((c) => (
        <li key={c.text} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-heading font-medium", pad, c.strong ? "border-maroon/40 bg-maroon-100 text-maroon" : "border-border bg-grey-100/70 text-grey-800")}>
          <c.icon className={cn("shrink-0", size === "md" ? "size-4" : "size-3.5", c.strong ? "text-maroon" : "text-grey-600")} aria-hidden />
          {c.text}
        </li>
      ))}
    </ul>
  );
}
