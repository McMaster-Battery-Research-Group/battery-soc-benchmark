"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/components/charts/palette";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "@/components/charts/chart-primitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** GA returns dates as YYYYMMDD. */
function label(d: string) {
  return d.length === 8 ? `${Number(d.slice(6, 8))} ${MONTHS[Number(d.slice(4, 6)) - 1] ?? ""}` : d;
}

/** Active users per day for the last 28 days: one bar a day, page views in the tooltip. */
export function DailyUsersChart({ daily }: { daily: { date: string; activeUsers: number; pageViews: number }[] }) {
  const data = daily.map((d) => ({ ...d, label: label(d.date) }));
  const max = Math.max(1, ...data.map((d) => d.activeUsers));
  return (
    <ChartFrame title="People per day" description="Distinct visitors each day over the last 28 days (Google Analytics “active users”). Hover a bar for page views.">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} tick={{ ...axisProps.tick, fontSize: 11 }} interval={Math.max(0, Math.floor(data.length / 7) - 1)} />
          <YAxis {...axisProps} width={36} allowDecimals={false} domain={[0, Math.ceil(max * 1.15)]} />
          <Tooltip cursor={{ fill: CHART.band }} content={({ active, payload, label: l }) => {
            const row = payload?.[0]?.payload as { activeUsers: number; pageViews: number } | undefined;
            return <ChartTooltip active={active} label={String(l)} rows={row ? [{ name: "People", value: String(row.activeUsers) }, { name: "Page views", value: String(row.pageViews) }] : []} />;
          }} />
          <Bar dataKey="activeUsers" name="People" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
