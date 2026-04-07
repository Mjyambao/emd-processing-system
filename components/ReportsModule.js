// components/ReportsModule.js
import { useEffect, useMemo, useState } from "react";
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

import Spinner from "./Spinner";
import { fetchReportingDataset } from "../api/reportApi";

const COLORS = {
  brand: "#b91c1c",
  green: "#16a34a",
  yellow: "#eab308",
  gray: "#6b7280",
  blue: "#2563eb",
  purple: "#7c3aed",
  orange: "#f97316",
};

// --------------------------------------------------
// Drill‑down modal configuration
// --------------------------------------------------
const MODAL_CONFIG = {
  Throughput: {
    columns: ["pnr", "status", "assigned", "stage", "createdAt", "errorClass"],
  },
  "Avg Completion Time": {
    statuses: ["processed"],
    columns: [
      "pnr",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "completionMinutes",
      "slaMinutes",
    ],
  },
  "Error Rate": {
    statuses: ["error", "human"],
    columns: ["pnr", "status", "assigned", "stage", "createdAt", "errorClass"],
  },
  Exceptions: {
    statuses: ["error", "human"],
    columns: [
      "pnr",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "adm",
      "feedback",
      "errorClass",
    ],
  },
  "Throughput over time": {
    columns: ["pnr", "status", "assigned", "stage", "createdAt", "errorClass"],
  },
  "AI vs Human corrections": {
    statuses: ["processed"],
    columns: [
      "pnr",
      "status",
      "isHumanCorrected",
      "assigned",
      "createdAt",
      "completionMinutes",
    ],
  },
  "End-to-end completion time": {
    statuses: ["processed"],
    columns: [
      "pnr",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "completionMinutes",
      "slaMinutes",
    ],
  },
  "Assignments to ticketers": {
    statuses: ["error", "human"],
    columns: ["pnr", "status", "assigned", "stage", "createdAt", "errorClass"],
  },
  "Error visibility & classification": {
    statuses: ["error"],
    columns: ["pnr", "status", "assigned", "stage", "createdAt", "errorClass"],
  },
  "LLM metrics (avg in range)": {
    statuses: ["processed"],
    columns: [
      "pnr",
      "status",
      "stage",
      "createdAt",
      "completionMinutes",
      "slaMinutes",
    ],
  },
  "LLM metrics trend over time": {
    statuses: ["processed"],
    columns: [
      "pnr",
      "status",
      "stage",
      "createdAt",
      "llm.accuracy",
      "llm.coherence",
      "llm.consistency",
      "llm.groundedness",
    ],
  },
};

// --------------------------------------------------
// Column definitions per modal
// --------------------------------------------------
const TICKETER_NAMES = [
  "Alice Reyes",
  "Ben Santos",
  "Clara Mendez",
  "David Cruz",
  "Elena Ramos",
  "Felix Torres",
  "Grace Lim",
  "Henry Uy",
];

function getTicketerName(seed) {
  return TICKETER_NAMES[seed % TICKETER_NAMES.length];
}

function getModalColumnDefs(modalTitle, onOpenPNR) {
  const pnrCol = {
    key: "pnr",
    header: "PNR",
    render: (r) => (
      <button
        type="button"
        className="text-brand-red hover:underline font-medium"
        onClick={() => onOpenPNR?.(r.pnr)}
        title="Open in Dashboard"
      >
        {r.pnr}
      </button>
    ),
  };

  const statusCol = {
    key: "status",
    header: "Status",
    render: (r) => <StatusBadge status={r.status} />,
  };
  const assignedCol = {
    key: "assigned",
    header: "Assigned To",
    render: (r) => r.assigned || "—",
  };
  const stageCol = {
    key: "stage",
    header: "Stage",
    render: (r) => r.stage || "—",
  };
  const createdAtCol = {
    key: "createdAt",
    header: "Date Created",
    render: (r) =>
      r.createdAt && r.createdAt !== "—"
        ? new Date(r.createdAt).toLocaleString()
        : "—",
  };
  const errorClassCol = {
    key: "errorClass",
    header: "Error Details",
    render: (r) => r.errorClass || "—",
  };
  const completionCol = {
    key: "completionMinutes",
    header: "Completion Time",
    render: (r) => minutesToHrs(r.completionMinutes),
  };
  const slaCol = {
    key: "slaMinutes",
    header: "SLA",
    render: (r) => minutesToHrs(r.slaMinutes),
  };
  const admCol = {
    key: "adm",
    header: "Is ADM?",
    render: (r) => (
      <span className={r.adm ? "text-red-600 font-medium" : "text-black/50"}>
        {r.adm ? "Yes" : "No"}
      </span>
    ),
  };
  const feedbackCol = {
    key: "feedback",
    header: "Feedback",
    render: (r) => (
      <span
        className={r.feedback ? "text-yellow-600 font-medium" : "text-black/50"}
      >
        {r.feedback ? "Yes" : "No"}
      </span>
    ),
  };
  const isHumanCorrectedCol = {
    key: "isHumanCorrected",
    header: "Is Human Corrected?",
    render: (r) => (
      <span
        className={
          r.isHumanCorrected
            ? "text-orange-600 font-medium"
            : "text-green-600 font-medium"
        }
      >
        {r.isHumanCorrected ? "Yes" : "No"}
      </span>
    ),
  };
  const assignedHumanCorrectedCol = {
    key: "assigned",
    header: "Assigned To",
    render: (r) => (r.isHumanCorrected ? r.assigned || "—" : "-"),
  };
  const accuracyCol = {
    key: "llmAccuracy",
    header: "Accuracy",
    render: (r) =>
      r.llmAccuracy != null ? `${Math.round(r.llmAccuracy * 100)}%` : "—",
  };
  const coherenceCol = {
    key: "llmCoherence",
    header: "Coherence",
    render: (r) =>
      r.llmCoherence != null ? `${Math.round(r.llmCoherence * 100)}%` : "—",
  };
  const consistencyCol = {
    key: "llmConsistency",
    header: "Consistency",
    render: (r) =>
      r.llmConsistency != null ? `${Math.round(r.llmConsistency * 100)}%` : "—",
  };
  const groundednessCol = {
    key: "llmGroundedness",
    header: "Groundedness",
    render: (r) =>
      r.llmGroundedness != null
        ? `${Math.round(r.llmGroundedness * 100)}%`
        : "—",
  };

  const configs = {
    Throughput: [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "Avg Completion Time": [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      completionCol,
      slaCol,
    ],
    "Error Rate": [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    Exceptions: [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      admCol,
      feedbackCol,
      errorClassCol,
    ],
    "Throughput over time": [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "AI vs Human corrections": [
      pnrCol,
      statusCol,
      isHumanCorrectedCol,
      assignedHumanCorrectedCol,
      createdAtCol,
      completionCol,
    ],
    "AI RFIC/RFISC vs Human corrections": [
      pnrCol,
      statusCol,
      isHumanCorrectedCol,
      assignedHumanCorrectedCol,
      createdAtCol,
      completionCol,
    ],
    "End-to-end completion time": [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      completionCol,
      slaCol,
    ],
    "Assignments to ticketers": [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "Error visibility & classification": [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "LLM metrics (avg in range)": [
      pnrCol,
      statusCol,
      stageCol,
      createdAtCol,
      completionCol,
      slaCol,
    ],
    "LLM metrics trend over time": [
      pnrCol,
      statusCol,
      stageCol,
      createdAtCol,
      accuracyCol,
      coherenceCol,
      consistencyCol,
      groundednessCol,
    ],
  };

  // Normalize title for drill-down titles that include "— Label" suffix
  const baseTitle = Object.keys(configs).find((k) => modalTitle.startsWith(k));
  return (
    configs[baseTitle] || [
      pnrCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ]
  );
}

function StatusBadge({ status }) {
  const map = {
    processed: "bg-green-100 text-green-700",
    processing: "bg-blue-100 text-blue-700",
    human: "bg-yellow-100 text-yellow-700",
    error: "bg-red-100 text-red-700",
  };
  const cls = map[status] || "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status || "—"}
    </span>
  );
}

function toDateKey(iso) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtShortDate(key) {
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

// ------------------------------
// Click-to-drilldown Modal + Table helpers
// ------------------------------
function safeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function buildSampleDetails({ title = "Detail", label = "", value = 0 } = {}) {
  const base = `${title}|${label}|${value}`;
  const seed = base.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const stages = ["Queue", "Extract", "Match", "Validate", "Post", "Complete"];
  const owners = [
    "Alice Reyes",
    "Ben Santos",
    "Clara Mendez",
    "David Cruz",
    "Elena Ramos",
    "Felix Torres",
    "Grace Lim",
    "Henry Uy",
  ];
  const errorClasses = [
    "Pricing",
    "Fare",
    "Ticket",
    "Tax",
    "Segment",
    "Unknown",
  ];
  const llmMetricSets = [
    { accuracy: 0.91, coherence: 0.87, consistency: 0.93, groundedness: 0.89 },
    { accuracy: 0.78, coherence: 0.82, consistency: 0.8, groundedness: 0.75 },
    { accuracy: 0.95, coherence: 0.9, consistency: 0.88, groundedness: 0.92 },
    { accuracy: 0.7, coherence: 0.74, consistency: 0.72, groundedness: 0.68 },
    { accuracy: 0.85, coherence: 0.83, consistency: 0.86, groundedness: 0.84 },
  ];

  // Determine which statuses to use based on modal title
  let allowedStatuses;
  if (
    title === "Avg Completion Time" ||
    title === "End-to-end completion time" ||
    title === "LLM metrics (avg in range)" ||
    title === "LLM metrics trend over time" ||
    title === "AI vs Human corrections" ||
    title === "AI RFIC/RFISC vs Human corrections"
  ) {
    allowedStatuses = ["processed"];
  } else if (
    title === "Error Rate" ||
    title === "Exceptions" ||
    title === "Assignments to ticketers"
  ) {
    allowedStatuses = ["error", "human"];
  } else if (title === "Error visibility & classification") {
    allowedStatuses = ["error"];
  } else {
    allowedStatuses = ["processed", "processing", "human", "error"];
  }

  // Always generate exactly 10 rows
  const n = 10;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const s = (seed + i * 97) % 1000;
    const dt = new Date(Date.now() - ((s % 14) + 1) * 24 * 60 * 60 * 1000);
    const ticketerSeed = (s + 5) % owners.length;
    const isHumanCorrected = s % 3 !== 0;
    const llm = llmMetricSets[(s + i) % llmMetricSets.length];

    rows.push({
      id: `RPT-${(seed % 9000) + 1000}-${i + 1}`,
      pnr: `PNR${(seed % 90000) + 10000 + i}`,
      status: allowedStatuses[s % allowedStatuses.length],
      assigned: isHumanCorrected ? owners[ticketerSeed] : "-",
      stage: stages[(s + 2) % stages.length],
      createdAt: dt.toISOString(),
      completionMinutes: (s % 180) + 10,
      slaMinutes: (s % 240) + 30,
      errorClass: errorClasses[(s + 3) % errorClasses.length],
      hilRequired: s % 5 === 0,
      slaBreached: s % 7 === 0,
      adm: s % 9 === 0,
      feedback: s % 6 === 0,
      isHumanCorrected,
      llmAccuracy: llm.accuracy,
      llmCoherence: llm.coherence,
      llmConsistency: llm.consistency,
      llmGroundedness: llm.groundedness,
      llm: {
        accuracy: llm.accuracy,
        coherence: llm.coherence,
        consistency: llm.consistency,
        groundedness: llm.groundedness,
      },
      description: `Sample detail row for ${title}${label ? ` (${label})` : ""}.`,
      __sample: true,
    });
  }
  return rows;
}

function normalizeReportRow(x) {
  const isHumanCorrected = !(
    x?.aiRFIC === x?.humanRFIC && x?.aiRFISC === x?.humanRFISC
  );
  return {
    id: x?.id,
    pnr: x?.pnr ?? "—",
    status: x?.status ?? "—",
    assigned: isHumanCorrected ? (x?.assigned ?? "Unassigned") : "-",
    stage: x?.stage ?? "—",
    createdAt: x?.createdAt ?? "—",
    completionMinutes: x?.completionMinutes,
    slaMinutes: x?.slaMinutes,
    errorClass: x?.errorClass ?? "",
    hilRequired: !!x?.hilRequired,
    slaBreached: !!x?.slaBreached,
    adm: !!x?.adm,
    feedback: !!x?.feedback,
    isHumanCorrected,
    aiRFIC: x?.aiRFIC,
    aiRFISC: x?.aiRFISC,
    humanRFIC: x?.humanRFIC,
    humanRFISC: x?.humanRFISC,
    llmAccuracy: x?.llm?.accuracy,
    llmConsistency: x?.llm?.consistency,
    llmGroundedness: x?.llm?.groundedness,
    llmCoherence: x?.llm?.coherence,
    llm: x?.llm,
    description: x?.description ?? "",
    __raw: x,
  };
}

function ClickableTooltip({ active, payload, label, metricLabel, onPick }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-xl border border-black/10 bg-white p-3 shadow-lg">
      <div className="text-sm font-medium text-black">{safeStr(label)}</div>
      <div className="mt-2 space-y-1">
        {payload.map((p, idx) => {
          const seriesName = p.name || p.dataKey || "Value";
          const val = p.value;
          return (
            <button
              key={`${seriesName}-${idx}`}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-black/5"
              title="Click to drill down"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPick?.({
                  metricLabel,
                  label,
                  seriesName,
                  dataKey: p.dataKey,
                  value: val,
                  raw: p,
                  source: "tooltip",
                });
              }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: p.color || "#6b7280" }}
                />
                <span className="text-black/70">{safeStr(seriesName)}</span>
              </span>
              <span className="font-semibold text-black">{safeStr(val)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-black/50">
        Tip: click a value to view detailed rows
      </div>
    </div>
  );
}

function DetailModal({ open, title, subtitle, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-black/10 p-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-black">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 text-sm text-black/60">{subtitle}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-black/70 hover:text-black"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  sub,
  icon,
  tone = "default",
  onClick,
  clickTitle,
}) {
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
          {onClick ? (
            <button
              type="button"
              className="mt-1 inline-flex items-baseline gap-2 rounded-lg px-2 py-1 text-2xl font-semibold text-black hover:bg-black/[0.04]"
              title={clickTitle || "Click to view details"}
              onClick={onClick}
            >
              <span>{value}</span>
            </button>
          ) : (
            <div className="mt-1 text-2xl font-semibold text-black">
              {value}
            </div>
          )}
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

function SubTabButton({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${
        active
          ? "border-red-200 bg-red-50 text-brand-red"
          : "border-black/10 bg-white text-black/70 hover:text-black"
      }`}
    >
      <i className={icon} />
      <span>{label}</span>
    </button>
  );
}

export default function ReportsModule({ onOpenPNR }) {
  // Sub-tabs
  const SUBTABS = {
    OVERVIEW: "overview",
    OPS: "ops",
    QUALITY: "quality",
    AI: "ai",
    EXCEPTIONS: "exceptions",
  };

  const [subTab, setSubTab] = useState(SUBTABS.OVERVIEW);

  // Drill-down modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState("Details");
  const [detailSubtitle, setDetailSubtitle] = useState("");
  const [detailRows, setDetailRows] = useState([]);

  // Modal table controls
  const [detailSearch, setDetailSearch] = useState("");
  const [detailSortKey, setDetailSortKey] = useState("createdAt");
  const [detailSortDir, setDetailSortDir] = useState("desc");
  const [detailFilters, setDetailFilters] = useState({
    status: "All",
    assigned: "All",
    stage: "All",
    errorClass: "All",
  });

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

  // Separate dataset: fetched independently (API-ready)
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  async function loadReports({ from: f = from, to: t = to } = {}) {
    setLoading(true);
    setLoadErr("");
    try {
      const data = await fetchReportingDataset({ from: f, to: t });
      setReportData(data);
    } catch (e) {
      setLoadErr(e?.message || "Failed to load reporting dataset.");
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }

  // Load once initially
  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const f = new Date(from + "T00:00:00.000Z").getTime();
    const t = new Date(to + "T23:59:59.999Z").getTime();
    return reportData.filter((x) => {
      const c = new Date(x.createdAt).getTime();
      return c >= f && c <= t;
    });
  }, [reportData, from, to]);

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
          completionSamples: [],
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
      const ok = x.aiRFIC === x.humanRFIC && x.aiRFISC === x.humanRFISC;
      ok ? same++ : corrected++;
    }
    return [
      { name: "Matched AI", value: same },
      { name: "Human corrected", value: corrected },
    ];
  }, [filtered]);

  const llmRadar = useMemo(() => {
    const acc = avg(
      filtered
        .map((x) => x.llm?.accuracy ?? 0)
        .filter((n) => typeof n === "number"),
    );
    const con = avg(
      filtered
        .map((x) => x.llm?.consistency ?? 0)
        .filter((n) => typeof n === "number"),
    );
    const gro = avg(
      filtered
        .map((x) => x.llm?.groundedness ?? 0)
        .filter((n) => typeof n === "number"),
    );
    const coh = avg(
      filtered
        .map((x) => x.llm?.coherence ?? 0)
        .filter((n) => typeof n === "number"),
    );
    return [
      { metric: "Accuracy", value: acc || 0 },
      { metric: "Consistency", value: con || 0 },
      { metric: "Groundedness", value: gro || 0 },
      { metric: "Coherence", value: coh || 0 },
    ];
  }, [filtered]);

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

  // ------------------------------
  // Drill-down modal helpers
  // ------------------------------
  const closeDetailModal = () => setDetailOpen(false);

  const openDetailModal = ({
    title,
    subtitle,
    rows,
    fallback,
    config,
  } = {}) => {
    // Normalize title for drill-down titles that include " — Label" suffix
    const baseTitle =
      Object.keys(MODAL_CONFIG).find((k) => title?.startsWith(k)) || title;

    const modalConfig =
      config || MODAL_CONFIG[baseTitle] || MODAL_CONFIG[title];

    const applyStatusRules = (list) => {
      if (!modalConfig?.statuses) return list;
      return list.filter((r) => modalConfig.statuses.includes(r.status));
    };

    let finalRows = Array.isArray(rows) ? rows.map(normalizeReportRow) : [];

    // Apply modal status rules
    finalRows = applyStatusRules(finalRows);

    // Fallback to sample data if no real rows
    if (!finalRows.length) {
      finalRows = applyStatusRules(
        buildSampleDetails({
          title: baseTitle,
          label: subtitle,
          value: 10,
        }),
      );
    }

    // Always cap at 10 rows
    finalRows = finalRows.slice(0, 10);

    setDetailTitle(title);
    setDetailSubtitle(subtitle || "");
    setDetailRows(finalRows);
    setDetailSearch("");
    setDetailFilters({
      status: "All",
      assigned: "All",
      stage: "All",
      errorClass: "All",
    });
    setDetailOpen(true);
  };

  const handleChartPick = ({
    metricLabel,
    label,
    seriesName,
    value,
    source,
  }) => {
    let rows = [];

    const dayRow =
      dailyAgg.find((d) => d.date === label) ||
      dailyAgg.find((d) => d.key === label);
    const dayKey = dayRow?.key;

    if (metricLabel === "Throughput over time") {
      rows = dayKey
        ? filtered.filter((x) => toDateKey(x.createdAt) === dayKey)
        : [];
      if (seriesName === "Processed")
        rows = rows.filter((x) => x.status === "processed");
      if (seriesName === "Human")
        rows = rows.filter((x) => x.status === "human");
      if (seriesName === "Error")
        rows = rows.filter((x) => x.status === "error");
    } else if (metricLabel === "End-to-end completion time") {
      rows = dayKey
        ? filtered.filter((x) => toDateKey(x.createdAt) === dayKey)
        : filtered;
      rows = rows.filter((x) => typeof x.completionMinutes === "number");
    } else if (metricLabel === "Assignments to ticketers") {
      rows = filtered.filter((x) => (x.assigned || "Unassigned") === label);
    } else if (metricLabel === "Error visibility & classification") {
      rows = filtered.filter(
        (x) =>
          x.status === "error" && (x.errorClass || "Unclassified") === label,
      );
    } else if (
      metricLabel === "AI vs Human corrections" ||
      metricLabel === "AI RFIC/RFISC vs Human corrections"
    ) {
      if (label === "Matched AI") {
        rows = filtered.filter(
          (x) => x.aiRFIC === x.humanRFIC && x.aiRFISC === x.humanRFISC,
        );
      } else if (label === "Human corrected") {
        rows = filtered.filter(
          (x) => !(x.aiRFIC === x.humanRFIC && x.aiRFISC === x.humanRFISC),
        );
      } else {
        rows = filtered;
      }
    } else if (metricLabel === "LLM metrics trend over time") {
      rows = dayKey
        ? filtered.filter((x) => toDateKey(x.createdAt) === dayKey)
        : filtered;
      rows = rows.filter((x) => !!x.llm);
    } else if (metricLabel === "LLM metrics (avg in range)") {
      rows = filtered.filter((x) => !!x.llm);
    } else {
      rows = filtered;
    }

    const sub = [
      seriesName ? `${seriesName}` : null,
      label ? `${label}` : null,
      value !== undefined ? `${value}` : null,
      source ? `${source}` : null,
    ]
      .filter(Boolean)
      .join(" • ");

    openDetailModal({
      title: `${metricLabel || "Details"}${label ? ` — ${label}` : ""}`,
      subtitle: sub,
      rows,
      fallback: buildSampleDetails({
        title: metricLabel || "Details",
        label,
        value,
      }),
      source,
    });
  };

  // detailOptions for modal dropdowns
  const detailOptions = useMemo(() => {
    const statuses = uniq(
      detailRows.map((r) => r.status).filter(Boolean),
    ).sort();
    const assigned = uniq(
      detailRows.map((r) => r.assigned).filter((v) => Boolean(v) && v !== "-"),
    ).sort();
    const stages = uniq(detailRows.map((r) => r.stage).filter(Boolean)).sort();
    const errorClasses = uniq(
      detailRows.map((r) => r.errorClass).filter(Boolean),
    ).sort();

    return {
      status: ["All", ...statuses],
      assigned: ["All", ...assigned],
      stage: ["All", ...stages],
      errorClass: ["All", ...errorClasses],
    };
  }, [detailRows]);

  const filteredDetailRows = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();

    let rows = detailRows.filter((r) => {
      if (detailFilters.status !== "All" && r.status !== detailFilters.status)
        return false;
      if (
        detailFilters.assigned !== "All" &&
        r.assigned !== detailFilters.assigned
      )
        return false;
      if (detailFilters.stage !== "All" && r.stage !== detailFilters.stage)
        return false;
      if (
        detailFilters.errorClass !== "All" &&
        (r.errorClass || "") !== detailFilters.errorClass
      )
        return false;

      if (!q) return true;

      const hay = [
        r.pnr,
        r.status,
        r.assigned,
        r.stage,
        r.createdAt,
        r.errorClass,
        r.description,
      ]
        .map(safeStr)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    rows.sort((a, b) => {
      const av = a?.[detailSortKey];
      const bv = b?.[detailSortKey];
      const aNum = Number(av);
      const bNum = Number(bv);
      const bothNums = !Number.isNaN(aNum) && !Number.isNaN(bNum);
      let cmp = 0;
      if (bothNums) cmp = aNum - bNum;
      else cmp = safeStr(av).localeCompare(safeStr(bv));
      return detailSortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [detailRows, detailSearch, detailFilters, detailSortKey, detailSortDir]);

  const toggleDetailSort = (key) => {
    if (detailSortKey !== key) {
      setDetailSortKey(key);
      setDetailSortDir("asc");
      return;
    }
    setDetailSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  // Derive column defs for the currently open modal
  const activeModalColumns = useMemo(
    () => getModalColumnDefs(detailTitle, onOpenPNR),
    [detailTitle, onOpenPNR],
  );

  const rangeControls = (
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

      <button
        type="button"
        onClick={() => loadReports({ from, to })}
        className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-black/70 hover:text-black"
        title="Reload dataset (API-ready)"
      >
        <i className="fa-solid fa-rotate mr-2" />
        Reload
      </button>
    </div>
  );

  const subTabNav = (
    <div className="flex flex-wrap items-center gap-2">
      <SubTabButton
        active={subTab === SUBTABS.OVERVIEW}
        onClick={() => setSubTab(SUBTABS.OVERVIEW)}
        icon="fa-solid fa-gauge-high"
        label="Overview"
      />
      <SubTabButton
        active={subTab === SUBTABS.OPS}
        onClick={() => setSubTab(SUBTABS.OPS)}
        icon="fa-solid fa-chart-line"
        label="Operations"
      />
      <SubTabButton
        active={subTab === SUBTABS.QUALITY}
        onClick={() => setSubTab(SUBTABS.QUALITY)}
        icon="fa-solid fa-circle-check"
        label="Quality"
      />
      <SubTabButton
        active={subTab === SUBTABS.AI}
        onClick={() => setSubTab(SUBTABS.AI)}
        icon="fa-solid fa-brain"
        label="AI Governance"
      />
      <SubTabButton
        active={subTab === SUBTABS.EXCEPTIONS}
        onClick={() => setSubTab(SUBTABS.EXCEPTIONS)}
        icon="fa-solid fa-triangle-exclamation"
        label="Exceptions"
      />
    </div>
  );

  return (
    <div className="mt-3">
      {/* Top controls */}
      <div className="flex flex-col gap-3">
        {subTabNav}
        <div className="flex justify-between flex-wrap gap-3 items-center">
          {rangeControls}
        </div>
      </div>

      {/* Loading / error */}
      {loading ? (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-black/10 bg-white p-4">
          <Spinner />
          <div className="text-sm text-black/70">Loading reports…</div>
        </div>
      ) : loadErr ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Failed to load reporting dataset</div>
          <div className="mt-1">{loadErr}</div>
        </div>
      ) : null}

      {/* KPI strip always visible */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Throughput"
          value={kpis.total}
          sub="PNRs created in range"
          icon={<i className="fa-solid fa-chart-line" />}
          onClick={() =>
            openDetailModal({
              title: "Throughput",
              subtitle: `PNRs created in range • ${filtered.length} items`,
              rows: filtered,
              fallback: buildSampleDetails({
                title: "Throughput",
                value: kpis.total,
              }),
              source: "kpi",
            })
          }
        />
        <Card
          title="Avg Completion Time"
          value={minutesToHrs(kpis.avgCompletion)}
          sub="End-to-end average"
          icon={<i className="fa-solid fa-stopwatch" />}
          tone={kpis.avgCompletion > 90 ? "warn" : "default"}
          onClick={() =>
            openDetailModal({
              title: "Avg Completion Time",
              subtitle: "Rows with completion time in range",
              rows: filtered.filter(
                (x) => typeof x.completionMinutes === "number",
              ),
              fallback: buildSampleDetails({
                title: "Avg Completion Time",
                value: kpis.avgCompletion,
              }),
              source: "kpi",
            })
          }
        />
        <Card
          title="Error Rate"
          value={pct(kpis.errorRate)}
          sub={`${kpis.error} errors • ${kpis.human} human-in-loop`}
          icon={<i className="fa-solid fa-triangle-exclamation" />}
          tone={kpis.errorRate > 0.2 ? "bad" : "default"}
          onClick={() =>
            openDetailModal({
              title: "Error Rate",
              subtitle: `${kpis.error} error rows in range (plus ${kpis.human} human-in-loop)`,
              rows: filtered.filter(
                (x) => x.status === "error" || x.status === "human",
              ),
              fallback: buildSampleDetails({
                title: "Error Rate",
                value: kpis.error,
              }),
              source: "kpi",
            })
          }
        />
        <Card
          title="Exceptions"
          value={`${kpis.slaBreaches} SLA • ${kpis.adms} ADM`}
          sub={`${kpis.feedback} with feedback`}
          icon={<i className="fa-solid fa-shield-halved" />}
          tone={kpis.slaBreaches > 0 ? "warn" : "good"}
          onClick={() =>
            openDetailModal({
              title: "Exceptions",
              subtitle: `${kpis.slaBreaches} SLA breaches • ${kpis.adms} ADM • ${kpis.feedback} with feedback`,
              rows: filtered.filter(
                (x) => x.slaBreached || x.adm || x.feedback,
              ),
              fallback: buildSampleDetails({
                title: "Exceptions",
                value: kpis.slaBreaches + kpis.adms,
              }),
              source: "kpi",
            })
          }
        />
      </div>

      {/* OVERVIEW */}
      {subTab === SUBTABS.OVERVIEW ? (
        <>
          <Section
            title="Overview"
            subtitle="A quick snapshot across operations, quality, and AI governance."
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-black/10 bg-white p-4">
                <div className="mb-2 text-sm font-medium text-black">
                  Throughput over time
                  <span className="ml-2 text-xs text-black/40">(daily)</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={dailyAgg}
                      onClick={(state) => {
                        const label = state?.activeLabel;
                        const ap = state?.activePayload || [];
                        const first = ap?.[0];
                        handleChartPick({
                          metricLabel: "Throughput over time",
                          label,
                          seriesName: first?.name,
                          value: first?.value,
                          source: "area",
                        });
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(0,0,0,0.06)"
                      />
                      <XAxis dataKey="date" />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                        content={(props) => (
                          <ClickableTooltip
                            {...props}
                            metricLabel="Throughput over time"
                            onPick={handleChartPick}
                          />
                        )}
                      />
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

              <div className="rounded-xl border border-black/10 bg-white p-4">
                <div className="mb-2 text-sm font-medium text-black">
                  AI vs Human corrections
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        content={(props) => (
                          <ClickableTooltip
                            {...props}
                            metricLabel="AI vs Human corrections"
                            onPick={handleChartPick}
                          />
                        )}
                      />
                      <Legend />
                      <Pie
                        data={aiVsHuman}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={90}
                        className="cursor-pointer"
                        onClick={(d) => {
                          const payload = d?.payload || d;
                          handleChartPick({
                            metricLabel: "AI vs Human corrections",
                            label: payload?.name,
                            seriesName: "",
                            value: payload?.value,
                            source: "",
                          });
                        }}
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
                  Tracks drift & effect of model improvements.
                </div>
              </div>
            </div>
          </Section>
        </>
      ) : null}

      {/* OPERATIONS */}
      {subTab === SUBTABS.OPS ? (
        <Section
          title="Operational Reporting"
          subtitle="Throughput, assignments, completion time, and error visibility."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-2 text-sm font-medium text-black">
                End-to-end completion time
                <span className="ml-2 text-xs text-black/40">
                  (avg minutes/day)
                </span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyAgg}
                    onClick={(state) => {
                      const label = state?.activeLabel;
                      const ap = state?.activePayload || [];
                      const first = ap?.[0];
                      handleChartPick({
                        metricLabel: "End-to-end completion time",
                        label,
                        seriesName: first?.name,
                        value: first?.value,
                        source: "line",
                      });
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(0,0,0,0.06)"
                    />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      content={(props) => (
                        <ClickableTooltip
                          {...props}
                          metricLabel="End-to-end completion time"
                          onPick={handleChartPick}
                        />
                      )}
                    />
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
                    <Tooltip
                      content={(props) => (
                        <ClickableTooltip
                          {...props}
                          metricLabel="Assignments to ticketers"
                          onPick={handleChartPick}
                        />
                      )}
                    />
                    <Bar
                      dataKey="count"
                      name="Assigned"
                      fill={COLORS.purple}
                      radius={[6, 6, 6, 6]}
                      className="cursor-pointer"
                      onClick={(d) => {
                        const payload = d?.payload || {};
                        handleChartPick({
                          metricLabel: "Assignments to ticketers",
                          label: payload?.name,
                          seriesName: "Assigned",
                          value: d?.value,
                          source: "bar",
                        });
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
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
                    <Tooltip
                      content={(props) => (
                        <ClickableTooltip
                          {...props}
                          metricLabel="Error visibility & classification"
                          onPick={handleChartPick}
                        />
                      )}
                    />
                    <Bar
                      dataKey="count"
                      name="Errors"
                      fill={COLORS.brand}
                      radius={[6, 6, 0, 0]}
                      className="cursor-pointer"
                      onClick={(d) => {
                        const payload = d?.payload || {};
                        handleChartPick({
                          metricLabel: "Error visibility & classification",
                          label: payload?.name,
                          seriesName: "Errors",
                          value: d?.value,
                          source: "bar",
                        });
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      {/* QUALITY */}
      {subTab === SUBTABS.QUALITY ? (
        <Section
          title="Quality & HIL Reporting"
          subtitle="Human-in-the-loop items and quality visibility."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-black">
                  PNRs requiring Human-in-the-Loop (HIL)
                </div>
                <div className="text-xs text-black/50">
                  Total:{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-red hover:underline"
                    onClick={() =>
                      openDetailModal({
                        title: "PNRs requiring Human-in-the-Loop (HIL)",
                        subtitle: `Total: ${hilList.length} in range`,
                        rows: hilList,
                        fallback: buildSampleDetails({
                          title: "HIL",
                          value: hilList.length,
                        }),
                        source: "total",
                      })
                    }
                  >
                    {hilList.length}
                  </button>
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
                rows={hilList.slice(0, 10)}
                emptyText="No HIL items in this range."
              />
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-black">
                  PNRs with feedback (any ADM status)
                </div>
                <div className="text-xs text-black/50">
                  Total:{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-red hover:underline"
                    onClick={() =>
                      openDetailModal({
                        title: "PNRs with feedback (any ADM status)",
                        subtitle: `Total: ${feedbackList.length} in range`,
                        rows: feedbackList,
                        fallback: buildSampleDetails({
                          title: "Feedback",
                          value: feedbackList.length,
                        }),
                        source: "total",
                      })
                    }
                  >
                    {feedbackList.length}
                  </button>
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
                rows={feedbackList.slice(0, 10)}
                emptyText="No feedback items in this range."
              />
            </div>
          </div>
        </Section>
      ) : null}

      {/* AI GOVERNANCE */}
      {subTab === SUBTABS.AI ? (
        <Section
          title="AI Governance Reporting"
          subtitle="RFIC/RFISC comparisons + LLM metrics."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-2 text-sm font-medium text-black">
                LLM metrics (avg in range)
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={llmRadar}
                    onClick={() =>
                      openDetailModal({
                        title: "LLM metrics (avg in range)",
                        subtitle: "Rows contributing to LLM metrics in range",
                        rows: filtered.filter((x) => !!x.llm),
                        fallback: buildSampleDetails({
                          title: "LLM metrics (avg in range)",
                          value: 12,
                        }),
                        source: "radar",
                      })
                    }
                  >
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
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-2 text-sm font-medium text-black">
                LLM metrics trend over time (daily avg)
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyAgg}
                    onClick={(state) => {
                      const label = state?.activeLabel;
                      const ap = state?.activePayload || [];
                      const first = ap?.[0];
                      handleChartPick({
                        metricLabel: "LLM metrics trend over time",
                        label,
                        seriesName: first?.name,
                        value: first?.value,
                        source: "line",
                      });
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(0,0,0,0.06)"
                    />
                    <XAxis dataKey="date" />
                    <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v)} />
                    <Tooltip
                      formatter={(v) => pct(v)}
                      content={(props) => (
                        <ClickableTooltip
                          {...props}
                          metricLabel="LLM metrics trend over time"
                          onPick={handleChartPick}
                        />
                      )}
                    />
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

            <div className="rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
              <div className="mb-2 text-sm font-medium text-black">
                AI RFIC/RFISC vs Human corrections
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={(props) => (
                        <ClickableTooltip
                          {...props}
                          metricLabel="AI RFIC/RFISC vs Human corrections"
                          onPick={handleChartPick}
                        />
                      )}
                    />
                    <Legend />
                    <Pie
                      data={aiVsHuman}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={95}
                      className="cursor-pointer"
                      onClick={(d) => {
                        const payload = d?.payload || d;
                        handleChartPick({
                          metricLabel: "AI RFIC/RFISC vs Human corrections",
                          label: payload?.name,
                          seriesName: "",
                          value: payload?.value,
                          source: "",
                        });
                      }}
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
            </div>
          </div>
        </Section>
      ) : null}

      {/* EXCEPTIONS */}
      {subTab === SUBTABS.EXCEPTIONS ? (
        <Section
          title="Exceptions"
          subtitle="SLA breaches, ADMs, and other high-priority visibility."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-black">
                  SLA breached PNRs
                </div>
                <div className="text-xs text-black/50">
                  Total:{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-red hover:underline"
                    onClick={() =>
                      openDetailModal({
                        title: "SLA breached PNRs",
                        subtitle: `Total: ${slaBreaches.length} in range`,
                        rows: slaBreaches,
                        fallback: buildSampleDetails({
                          title: "SLA breached",
                          value: slaBreaches.length,
                        }),
                        source: "total",
                      })
                    }
                  >
                    {slaBreaches.length}
                  </button>
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
                rows={slaBreaches.slice(0, 10)}
                emptyText="No SLA breaches in this range."
              />
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-black">ADMs</div>
                <div className="text-xs text-black/50">
                  Total:{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-red hover:underline"
                    onClick={() =>
                      openDetailModal({
                        title: "ADMs",
                        subtitle: `Total: ${admList.length} in range`,
                        rows: admList,
                        fallback: buildSampleDetails({
                          title: "ADM",
                          value: admList.length,
                        }),
                        source: "total",
                      })
                    }
                  >
                    {admList.length}
                  </button>
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
                  {
                    key: "createdAt",
                    header: "Created",
                    render: (r) => new Date(r.createdAt).toLocaleString(),
                  },
                ]}
                rows={admList.slice(0, 10)}
                emptyText="No ADMs in this range."
              />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Drill-down Modal */}
      <DetailModal
        open={detailOpen}
        title={detailTitle}
        subtitle={detailSubtitle}
        onClose={closeDetailModal}
      >
        {/* Filters row */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <input
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
              placeholder="Search details…"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          <div className="lg:col-span-1">
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={detailFilters.status}
              onChange={(e) =>
                setDetailFilters((p) => ({ ...p, status: e.target.value }))
              }
            >
              {detailOptions.status.map((opt) => (
                <option key={`st-${opt}`} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={detailFilters.assigned}
              onChange={(e) =>
                setDetailFilters((p) => ({ ...p, assigned: e.target.value }))
              }
            >
              {detailOptions.assigned.map((opt) => (
                <option key={`as-${opt}`} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={detailFilters.stage}
              onChange={(e) =>
                setDetailFilters((p) => ({ ...p, stage: e.target.value }))
              }
            >
              {detailOptions.stage.map((opt) => (
                <option key={`sg-${opt}`} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={detailFilters.errorClass}
              onChange={(e) =>
                setDetailFilters((p) => ({ ...p, errorClass: e.target.value }))
              }
            >
              {detailOptions.errorClass.map((opt) => (
                <option key={`ec-${opt || "blank"}`} value={opt}>
                  {opt || "(blank)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic table using activeModalColumns */}
        <div className="mt-4 overflow-auto rounded-xl border border-black/10">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-black/10">
                {activeModalColumns.map((col) => (
                  <th
                    key={col.key}
                    className="cursor-pointer whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black/60 hover:text-black select-none"
                    onClick={() => toggleDetailSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.header}
                      {detailSortKey === col.key ? (
                        <span className="text-black/40">
                          {detailSortDir === "asc" ? "↑" : "↓"}
                        </span>
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!filteredDetailRows.length ? (
                <tr>
                  <td
                    colSpan={activeModalColumns.length}
                    className="px-3 py-10 text-center text-black/50"
                  >
                    No rows match your filters.
                  </td>
                </tr>
              ) : (
                filteredDetailRows.slice(0, 10).map((r, idx) => (
                  <tr
                    key={`${r.pnr}-${idx}`}
                    className="border-b border-black/5 hover:bg-black/[0.02]"
                  >
                    {activeModalColumns.map((col) => (
                      <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                        {typeof col.render === "function"
                          ? col.render(r)
                          : safeStr(r[col.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-black/50">
          <div>
            Showing{" "}
            <span className="font-semibold text-black">
              {Math.min(filteredDetailRows.length, 10)}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-black">
              {filteredDetailRows.length}
            </span>{" "}
            rows
            {filteredDetailRows.length > 10 ? " (truncated to 10)" : ""}
          </div>
          <div className="text-black/40">
            Click chart values, bars, slices, or tooltip numbers to drill down.
          </div>
        </div>
      </DetailModal>
    </div>
  );
}
