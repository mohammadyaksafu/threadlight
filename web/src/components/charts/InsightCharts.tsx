// Overview insight charts. Recharts draws where the risk index comes from; Apache ECharts draws each
// document's validity window against today and the audit day. Both read the same engine result as the
// rest of the app, so they move with the what-if simulation and with live data.
import { useEffect, useMemo, useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as echarts from "echarts/core";
import { BarChart as EBar } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { PENALTY, dayNumber } from "@/engine";
import type { Data, Result, Status } from "@/engine";
import { STATUS } from "@/lib/vocab";

echarts.use([EBar, GridComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);

// Literal class names so Tailwind keeps them.
const FILL: Record<Status, string> = {
  supported: "fill-ok", likely_gap: "fill-gap", insufficient: "fill-insuf", conflicting: "fill-conf", pending_review: "fill-pend",
};

/** Each requirement's share of the risk index: criticality x status penalty, over total criticality. Sums to the index. */
export function riskContributions(result: Result) {
  const total = result.requirements.reduce((n, r) => n + r.criticality, 0);
  return result.requirements.map((r) => ({
    id: r.id, title: r.title, status: r.status,
    points: Math.round((1000 * r.criticality * PENALTY[r.status]) / total) / 10,
  }));
}

export function RiskContributionChart({ result }: { result: Result }) {
  const rows = riskContributions(result);
  return (
    <div className="h-64" role="img" aria-label={"Risk index points by requirement: " + rows.map((r) => `${r.id} ${r.points}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} className="stroke-line" strokeDasharray="3 3" />
          <XAxis dataKey="id" tickLine={false} axisLine={false} tick={{ className: "fill-ink-2 text-xs" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ className: "fill-ink-2 text-xs" }} allowDecimals={false} />
          <Tooltip cursor={{ className: "fill-surface-2" }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lift">
                  <div className="font-semibold">{p.id} · {p.title}</div>
                  <div className="text-ink-2">{STATUS[p.status as Status].en} · {p.points} risk points</div>
                </div>
              );
            }} />
          <Bar dataKey="points" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.id} className={FILL[r.status]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const rgb = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).join(",")})`;
const EXPIRY_TOKEN = { expired: "gap", expires_before_audit: "insuf", valid: "ok", no_expiry: "pend" } as const;

/** Active documents with an expiry date, as day numbers (days since 1970-01-01) from issue to expiry. */
export function validityWindows(data: Data, result: Result) {
  const state = Object.fromEntries(result.documents.map((d) => [d.id, d.expiry_state]));
  return data.documents
    .filter((d) => result.active_documents.includes(d.id) && d.valid_until)
    .map((d) => ({ id: d.id, title: d.title, issued: d.issued, valid_until: d.valid_until!,
                   start: dayNumber(d.issued), end: dayNumber(d.valid_until!), state: state[d.id] }));
}

const iso = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);

export function ValidityTimelineChart({ data, result }: { data: Data; result: Result }) {
  const el = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => validityWindows(data, result), [data, result]);
  const today = dayNumber(result.today), audit = dayNumber(result.audit_date);

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: "svg" });
    const ink2 = rgb("ink-2"), line = rgb("line");
    chart.setOption({
      animation: false,
      grid: { left: 44, right: 28, top: 28, bottom: 28 },
      tooltip: {
        trigger: "item",
        formatter: (p: { dataIndex: number }) => {
          const r = rows[p.dataIndex];
          return `<b>${r.id}</b> ${r.title}<br/>${r.issued} to ${r.valid_until}`;
        },
      },
      // The transparent offset bar starts at 0, so the axis is pinned to the documents' own range (bars are clipped).
      xAxis: { type: "value", min: Math.min(...rows.map((r) => r.start), today) - 20, max: Math.max(...rows.map((r) => r.end), audit) + 20,
        axisLabel: { color: ink2, fontSize: 11, formatter: (v: number) => iso(v).slice(0, 7), hideOverlap: true },
        splitLine: { lineStyle: { color: line, type: "dashed" } } },
      yAxis: { type: "category", data: rows.map((r) => r.id), inverse: true, axisLabel: { color: ink2, fontSize: 11 },
        axisLine: { lineStyle: { color: line } }, axisTick: { show: false } },
      series: [
        { type: "bar", stack: "w", silent: true, clip: true, itemStyle: { color: "transparent" }, data: rows.map((r) => r.start) },
        {
          type: "bar", stack: "w", barWidth: 12, clip: true,
          data: rows.map((r) => ({ value: r.end - r.start, itemStyle: { color: rgb(EXPIRY_TOKEN[r.state]), borderRadius: 4 } })),
          markLine: {
            symbol: "none", silent: true, label: { show: false },
            data: [
              { name: "today", xAxis: today, lineStyle: { color: ink2, type: "solid" } },
              { name: "audit", xAxis: audit, lineStyle: { color: rgb("gap"), type: "dashed", width: 2 } },
            ],
          },
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.dispose(); };
  }, [rows, today, audit]);

  return (
    <div ref={el} className="h-64 w-full" role="img"
      aria-label={"Document validity against the audit day: " + rows.map((r) => `${r.id} valid until ${r.valid_until}`).join(", ") + `; audit on ${result.audit_date}`} />
  );
}
