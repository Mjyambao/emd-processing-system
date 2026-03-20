// components/ReportingDashboard.js
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = {
  brand: "#b91c1c", // red-700-ish
  green: "#16a34a",
  yellow: "#eab308",
  gray: "#6b7280",
  blue: "#2563eb",
  purple: "#7c3aed",
  orange: "#f97316",
};

function toDateKey(iso) {
  const d = new Date(iso);
  // yyyy-mm-dd
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtShortDate(key) {
  // key is yyyy-mm-dd
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
  }).format(dt);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(n) {
  return `${Math.round(clamp01(n) * 100)}%`;
}

function minutesToHrs(min) {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function Card({ title, value, sub, icon, tone = "default" }) {
  const toneClass =
    tone === "good"
      ? "bg-green-50 border-green-200"
      : tone === "warn"
        ? "bg-yellow-50 border-yellow-200"
        : tone === "bad"
          ? "bg-red-50 border-red-200"
          : "bg-white border-black/10";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-black/70">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-black/50">
            {title}
          </div>
          <div className="mt-1 text-2xl font-semibold text-black">{value}</div>
          {sub ? <div className="mt-1 text-sm text-black/60">{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, right }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-black">{title}</h2>
          {subtitle ? (
            <p className="text-sm text-black/60">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function SimpleTable({ columns, rows, emptyText = "No items." }) {
  return (
    <div className="overflow-auto rounded-xl border border-black/10 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-black/[0.03] text-black/70">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="whitespace-nowrap px-3 py-2 text-left font-medium"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-black/50"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr
                key={r.id || r.pnr || idx}
                className="border-t border-black/5 hover:bg-black/[0.02]"
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    {typeof c.render === "function" ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportingDashboard({ data = [], onOpenPNR }) {
  // timeframe controls
  const presets = {
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    CUSTOM: "custom",
  };
  const [preset, setPreset] = useState(presets.MONTHLY);

  const now = new Date();
  const [from, setFrom] = useState(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => now.toISOString().slice(0, 10));

  function setPresetRange(p) {
    setPreset(p);
    const dTo = new Date();
    const dFrom = new Date(dTo);

    if (p === presets.DAILY) dFrom.setDate(dTo.getDate() - 0);
    if (p === presets.WEEKLY) dFrom.setDate(dTo.getDate() - 6);
    if (p === presets.MONTHLY) dFrom.setDate(dTo.getDate() - 29);

    setFrom(dFrom.toISOString().slice(0, 10));
    setTo(dTo.toISOString().slice(0, 10));
  }

  const filtered = useMemo(() => {
    // inclusive date filter, based on createdAt
    const f = new Date(from + "T00:00:00.000Z").getTime();
    const t = new Date(to + "T23:59:59.999Z").getTime();
    return data.filter((x) => {
      const c = new Date(x.createdAt).getTime();
      return c >= f && c <= t;
    });
  }, [data, from, to]);

  // --- Aggregations
  const dailyAgg = useMemo(() => {
    const map = new Map();
    for (const x of filtered) {
      const key = toDateKey(x.createdAt);
      if (!map.has(key)) {
        map.set(key, {
          key,
          date: fmtShortDate(key),
          throughput: 0,
          processed: 0,
          human: 0,
          error: 0,
          avgCompletion: 0,
          completionSamples: [],
          // LLM metric samples
          acc: [],
          con: [],
          gro: [],
          coh: [],
        });
      }
      const row = map.get(key);
      row.throughput += 1;
      if (x.status === "processed") row.processed += 1;
      if (x.status === "human") row.human += 1;
      if (x.status === "error") row.error += 1;

      if (typeof x.completionMinutes === "number") {
        row.completionSamples.push(x.completionMinutes);
      }
      if (x.llm) {
        row.acc.push(x.llm.accuracy);
        row.con.push(x.llm.consistency);
        row.gro.push(x.llm.groundedness);
        row.coh.push(x.llm.coherence);
      }
    }
    const arr = Array.from(map.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    return arr.map((r) => ({
      ...r,
      avgCompletion: Math.round(avg(r.completionSamples) || 0),
      accuracy: avg(r.acc) || 0,
      consistency: avg(r.con) || 0,
      groundedness: avg(r.gro) || 0,
      coherence: avg(r.coh) || 0,
    }));
  }, [filtered]);

  const assignmentsAgg = useMemo(() => {
    const map = new Map();
    for (const x of filtered) {
      const k = x.assigned || "Unassigned";
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const errorClassAgg = useMemo(() => {
    const map = new Map();
    for (const x of filtered) {
      if (x.status !== "error") continue;
      const k = x.errorClass || "Unclassified";
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const hilList = useMemo(
    () => filtered.filter((x) => x.hilRequired),
    [filtered],
  );

  const slaBreaches = useMemo(
    () => filtered.filter((x) => x.slaBreached),
    [filtered],
  );

  const admList = useMemo(() => filtered.filter((x) => x.adm), [filtered]);
  const feedbackList = useMemo(
    () => filtered.filter((x) => x.feedback),
    [filtered],
  );

  const aiVsHuman = useMemo(() => {
    let same = 0;
    let corrected = 0;
    for (const x of filtered) {
      const ok =
        x.aiRFIC === x.humanRFIC && x.aiRFISC === x.humanRFISC ? true : false;
      ok ? same++ : corrected++;
    }
    return [
      { name: "Matched AI", value: same },
      { name: "Human corrected", value: corrected },
    ];
  }, [filtered]);

  const llmRadar = useMemo(() => {
    const acc = avg(filtered.map((x) => x.llm?.accuracy ?? 0).filter(Boolean));
    const con = avg(
      filtered.map((x) => x.llm?.consistency ?? 0).filter(Boolean),
    );
    const gro = avg(
      filtered.map((x) => x.llm?.groundedness ?? 0).filter(Boolean),
    );
    const coh = avg(filtered.map((x) => x.llm?.coherence ?? 0).filter(Boolean));
    return [
      { metric: "Accuracy", value: acc },
      { metric: "Consistency", value: con },
      { metric: "Groundedness", value: gro },
      { metric: "Coherence", value: coh },
    ];
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const processed = filtered.filter((x) => x.status === "processed").length;
    const error = filtered.filter((x) => x.status === "error").length;
    const human = filtered.filter((x) => x.status === "human").length;

    const completion = filtered
      .map((x) => x.completionMinutes)
      .filter((n) => typeof n === "number");

    const avgCompletion = Math.round(avg(completion) || 0);
    const errorRate = total ? error / total : 0;

    return {
      total,
      processed,
      error,
      human,
      avgCompletion,
      errorRate,
      hil: hilList.length,
      slaBreaches: slaBreaches.length,
      adms: admList.length,
      feedback: feedbackList.length,
    };
  }, [
    filtered,
    hilList.length,
    slaBreaches.length,
    admList.length,
    feedbackList.length,
  ]);

  const headerRight = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setPresetRange(presets.DAILY)}
        className={`rounded-lg border px-3 py-1.5 text-sm ${
          preset === presets.DAILY
            ? "border-red-200 bg-red-50 text-brand-red"
            : "border-black/10 bg-white text-black/70 hover:text-black"
        }`}
      >
        Daily
      </button>
      <button
        type="button"
        onClick={() => setPresetRange(presets.WEEKLY)}
        className={`rounded-lg border px-3 py-1.5 text-sm ${
          preset === presets.WEEKLY
            ? "border-red-200 bg-red-50 text-brand-red"
            : "border-black/10 bg-white text-black/70 hover:text-black"
        }`}
      >
        Weekly
      </button>
      <button
        type="button"
        onClick={() => setPresetRange(presets.MONTHLY)}
        className={`rounded-lg border px-3 py-1.5 text-sm ${
          preset === presets.MONTHLY
            ? "border-red-200 bg-red-50 text-brand-red"
            : "border-black/10 bg-white text-black/70 hover:text-black"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setPreset(presets.CUSTOM)}
        className={`rounded-lg border px-3 py-1.5 text-sm ${
          preset === presets.CUSTOM
            ? "border-red-200 bg-red-50 text-brand-red"
            : "border-black/10 bg-white text-black/70 hover:text-black"
        }`}
      >
        Custom
      </button>

      <div className="ml-1 flex items-center gap-2">
        <label className="text-xs text-black/50">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setPreset(presets.CUSTOM);
            setFrom(e.target.value);
          }}
          className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
        />
        <label className="text-xs text-black/50">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setPreset(presets.CUSTOM);
            setTo(e.target.value);
          }}
          className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="mt-3">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Throughput"
          value={kpis.total}
          sub="PNRs created in range"
          icon={<i className="fa-solid fa-chart-line" />}
        />
        <Card
          title="Avg Completion Time"
          value={minutesToHrs(kpis.avgCompletion)}
          sub="End-to-end average"
          icon={<i className="fa-solid fa-stopwatch" />}
          tone={kpis.avgCompletion > 90 ? "warn" : "default"}
        />
        <Card
          title="Error Rate"
          value={pct(kpis.errorRate)}
          sub={`${kpis.error} errors • ${kpis.human} human-in-loop`}
          icon={<i className="fa-solid fa-triangle-exclamation" />}
          tone={kpis.errorRate > 0.2 ? "bad" : "default"}
        />
        <Card
          title="Exceptions"
          value={`${kpis.slaBreaches} SLA • ${kpis.adms} ADM`}
          sub={`${kpis.feedback} with feedback`}
          icon={<i className="fa-solid fa-shield-halved" />}
          tone={kpis.slaBreaches > 0 ? "warn" : "good"}
        />
      </div>

      <Section
        title="Operational Reporting"
        subtitle="Throughput, assignments, end-to-end completion time, and error visibility."
        right={headerRight}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Throughput over time */}
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 text-sm font-medium text-black">
              Throughput over time
              <span className="ml-2 text-xs text-black/40">(daily)</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyAgg}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.06)"
                  />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="processed"
                    name="Processed"
                    stackId="1"
                    stroke={COLORS.green}
                    fill="rgba(22,163,74,0.25)"
                  />
                  <Area
                    type="monotone"
                    dataKey="human"
                    name="Human"
                    stackId="1"
                    stroke={COLORS.gray}
                    fill="rgba(107,114,128,0.18)"
                  />
                  <Area
                    type="monotone"
                    dataKey="error"
                    name="Error"
                    stackId="1"
                    stroke={COLORS.brand}
                    fill="rgba(185,28,28,0.18)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Completion time */}
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 text-sm font-medium text-black">
              End-to-end completion time
              <span className="ml-2 text-xs text-black/40">
                (avg minutes/day)
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyAgg}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.06)"
                  />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="avgCompletion"
                    name="Avg Completion (min)"
                    stroke={COLORS.blue}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Assignments */}
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 text-sm font-medium text-black">
              Assignments to ticketers
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assignmentsAgg} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.06)"
                  />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Assigned"
                    fill={COLORS.purple}
                    radius={[6, 6, 6, 6]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Error classification */}
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 text-sm font-medium text-black">
              Error visibility & classification
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorClassAgg}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.06)"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    interval={0}
                    height={60}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Errors"
                    fill={COLORS.brand}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Quality & HIL Reporting"
        subtitle="Identify human-in-the-loop PNRs, SLA breaches, ADMs, and feedback visibility."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-black">
                PNRs requiring Human-in-the-Loop (HIL)
              </div>
              <div className="text-xs text-black/50">
                Total:{" "}
                <span className="font-semibold text-black">
                  {hilList.length}
                </span>
              </div>
            </div>

            <SimpleTable
              columns={[
                {
                  key: "pnr",
                  header: "PNR",
                  render: (r) => (
                    <button
                      type="button"
                      className="text-brand-red hover:underline"
                      onClick={() => onOpenPNR?.(r.pnr)}
                      title="Open in Dashboard"
                    >
                      {r.pnr}
                    </button>
                  ),
                },
                { key: "assigned", header: "Assigned" },
                { key: "stage", header: "Stage" },
                {
                  key: "createdAt",
                  header: "Created",
                  render: (r) => new Date(r.createdAt).toLocaleString(),
                },
              ]}
              rows={hilList.slice(0, 8)}
              emptyText="No HIL items in this range."
            />
            {hilList.length > 8 ? (
              <div className="mt-2 text-xs text-black/50">
                Showing 8 of {hilList.length}. (Wire a modal/pagination later if
                needed.)
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-black">
                SLA breached PNRs
              </div>
              <div className="text-xs text-black/50">
                Total:{" "}
                <span className="font-semibold text-black">
                  {slaBreaches.length}
                </span>
              </div>
            </div>

            <SimpleTable
              columns={[
                {
                  key: "pnr",
                  header: "PNR",
                  render: (r) => (
                    <button
                      type="button"
                      className="text-brand-red hover:underline"
                      onClick={() => onOpenPNR?.(r.pnr)}
                    >
                      {r.pnr}
                    </button>
                  ),
                },
                { key: "assigned", header: "Assigned" },
                {
                  key: "sla",
                  header: "SLA",
                  render: (r) => minutesToHrs(r.slaMinutes),
                },
                {
                  key: "completion",
                  header: "Completion",
                  render: (r) => minutesToHrs(r.completionMinutes),
                },
              ]}
              rows={slaBreaches.slice(0, 8)}
              emptyText="No SLA breaches in this range."
            />
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-black">
                PNRs resulting in ADMs
              </div>
              <div className="text-xs text-black/50">
                Total:{" "}
                <span className="font-semibold text-black">
                  {admList.length}
                </span>
              </div>
            </div>
            <SimpleTable
              columns={[
                {
                  key: "pnr",
                  header: "PNR",
                  render: (r) => (
                    <button
                      type="button"
                      className="text-brand-red hover:underline"
                      onClick={() => onOpenPNR?.(r.pnr)}
                    >
                      {r.pnr}
                    </button>
                  ),
                },
                { key: "assigned", header: "Assigned" },
                { key: "stage", header: "Stage" },
              ]}
              rows={admList.slice(0, 8)}
              emptyText="No ADMs in this range."
            />
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-black">
                PNRs with feedback (any ADM status)
              </div>
              <div className="text-xs text-black/50">
                Total:{" "}
                <span className="font-semibold text-black">
                  {feedbackList.length}
                </span>
              </div>
            </div>
            <SimpleTable
              columns={[
                {
                  key: "pnr",
                  header: "PNR",
                  render: (r) => (
                    <button
                      type="button"
                      className="text-brand-red hover:underline"
                      onClick={() => onOpenPNR?.(r.pnr)}
                    >
                      {r.pnr}
                    </button>
                  ),
                },
                { key: "assigned", header: "Assigned" },
                {
                  key: "adm",
                  header: "ADM",
                  render: (r) => (r.adm ? "Yes" : "No"),
                },
              ]}
              rows={feedbackList.slice(0, 8)}
              emptyText="No feedback items in this range."
            />
          </div>
        </div>
      </Section>

      <Section
        title="AI Governance Reporting"
        subtitle="AI-inferred RFIC/RFISC vs human corrections + LLM metrics (Accuracy, Consistency, Groundedness, Coherence)."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* AI vs Human */}
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 text-sm font-medium text-black">
              AI RFIC/RFISC vs Human corrections
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={aiVsHuman}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                  >
                    {aiVsHuman.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={idx === 0 ? COLORS.green : COLORS.orange}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-black/60">
              Tip: use this to track drift & retraining impact over time.
            </div>
          </div>

          {/* LLM Radar */}
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <div className="mb-2 text-sm font-medium text-black">
              LLM metrics (avg in range)
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={llmRadar}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis
                    domain={[0, 1]}
                    tickFormatter={(v) => pct(v)}
                  />
                  <Tooltip formatter={(v) => pct(v)} />
                  <Radar
                    name="LLM"
                    dataKey="value"
                    stroke={COLORS.blue}
                    fill="rgba(37,99,235,0.18)"
                    fillOpacity={1}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-black/60">
              Accuracy/Consistency/Groundedness/Coherence are sample values —
              wire them to your evaluator output later.
            </div>
          </div>

          {/* LLM metrics over time */}
          <div className="rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
            <div className="mb-2 text-sm font-medium text-black">
              LLM metrics trend over time (daily avg)
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyAgg}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.06)"
                  />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v)} />
                  <Tooltip formatter={(v) => pct(v)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke={COLORS.green}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="consistency"
                    stroke={COLORS.blue}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="groundedness"
                    stroke={COLORS.purple}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="coherence"
                    stroke={COLORS.orange}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
