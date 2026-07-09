import { useEffect, useMemo, useRef, useState } from "react";
import { appLogger } from "../utils/appLogger";
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
import PNRDetails from "./PNRDetails";

import {
  getDashboardSummary,
  getThroughputOverTime,
  getAiVsHumanCorrections,
  getEndToEndAvgTime,
  getAssignmentsToTicketers,
  getErrorVisibilityClassification,
  getHilPnrs,
  getPnrAdm,
  getLlmMetricsAvgInRange,
  getLlmMetricsTrendOverTime,
} from "../api/reportApi";

const COLORS = {
  brand: "#b91c1c",
  green: "#16a34a",
  yellow: "#eab308",
  gray: "#6b7280",
  blue: "#2563eb",
  purple: "#7c3aed",
  orange: "#f97316",
};

const DATE_LOCALE = "en-US";
const DATE_TZ = "UTC";

// --------------------------------------------------
// Display helpers (null -> "-")
// --------------------------------------------------
function display(v) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "-";
    if (s === "—") return "-";
    return s;
  }
  return v;
}

function normalizeStatus(v) {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (!s) return "-";
  const norm = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (
    norm === "processed" ||
    norm === "complete" ||
    norm === "completed" ||
    norm === "done"
  )
    return "processed";
  if (norm === "processing" || norm === "in progress" || norm === "in process")
    return "processing";
  if (norm.includes("human")) return "human";
  if (
    norm.includes("error") ||
    norm.includes("failed") ||
    norm.includes("exception")
  )
    return "error";
  return norm;
}

function safeStr(v) {
  const d = display(v);
  return d === "-" ? "" : String(d);
}

function normCmp(v) {
  return String(display(v)).trim().toLowerCase();
}

function toDateKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Use UTC to avoid day-shift issues when APIs/Charts are UTC-based.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtShortDate(key) {
  if (!key) return "-";
  const parts = String(key).split("-").map(Number);
  if (parts.length !== 3) return String(key);
  const [y, m, d] = parts;
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
  }).format(dt);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function normalizePercentage01(p) {
  if (p == null) return null;
  const n = Number(p);
  if (Number.isNaN(n)) return null;
  // API may return 0-1 (fraction) or 0-100 (percentage). Normalize to 0-1.
  return n > 1 ? n / 100 : n;
}

function pct(n01) {
  const v = n01 == null ? 0 : clamp01(Number(n01) || 0);
  return `${Math.round(v * 100)}%`;
}

function coerceNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function minutesToHrs(min) {
  const m = coerceNumber(min);
  if (m == null) return "-";
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return `${h}h ${rem}m`;
}

function secondsToMinutes(sec) {
  const s = coerceNumber(sec);
  if (s == null) return null;
  return Math.round(s / 60);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

// --------------------------------------------------
// Modal configuration
// --------------------------------------------------
const MODAL_CONFIG = {
  Throughput: {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "errorClass",
    ],
  },
  "Avg Completion Time": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "triageTime",
      "maskCheckTime",
      "dealMatchingTime",
      "issuanceTime",
      "invoicingTime",
      "completionMinutes",
      "slaMinutes",
    ],
  },
  "Error Rate": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "slaStartTime",
      "processingMinutes",
      "errorClass",
      "resolutionStatus",
    ],
  },
  Exceptions: {
    columns: [
      "pnr",
      "ancillaryId",
      "airline",
      "emdType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "slaBreached",
      "slaMinutes",
      "processingTime",
      "adm",
      "feedback",
      "errorClass",
    ],
  },
  "Throughput over time": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "errorClass",
    ],
  },
  "AI vs Human corrections": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "createdAt",
      "aiRFIC",
      "aiRFISC",
      "aiEmdDesc",
      "correctedRFIC",
      "correctedRFISC",
      "correctedEmdDesc",
      "completionMinutes",
    ],
  },
  "End-to-end completion time": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "triageTime",
      "maskCheckTime",
      "dealMatchingTime",
      "issuanceTime",
      "invoicingTime",
      "completionMinutes",
      "slaMinutes",
    ],
  },
  "Assignments to ticketers": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "errorClass",
    ],
  },
  "Error visibility & classification": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "assigned",
      "stage",
      "createdAt",
      "errorClass",
    ],
  },
  "PNRs requiring Human-in-the-Loop (HIL)": {
    columns: ["pnr", "assigned", "stage", "createdAt"],
  },
  "PNRs with feedback (any ADM status)": {
    columns: ["pnr", "emdNumber", "assigned", "feedbackText", "adm"],
  },
  "SLA breached PNRs": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "assigned",
      "slaMinutes",
      "completionMinutes",
    ],
  },
  ADMs: {
    columns: ["pnr", "emdNumber", "assigned", "feedbackText"],
  },
  "LLM metrics (avg in range)": {
    columns: [
      "pnr",
      "airline",
      "documentType",
      "status",
      "stage",
      "createdAt",
      "slaMinutes",
    ],
  },
  "LLM metrics trend over time": {
    columns: [
      "pnr",
      "airline",
      "documentType",
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
// Column renderers
// --------------------------------------------------
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
      {display(status)}
    </span>
  );
}

function getSlaMinutesForDocType(documentType) {
  return documentType === "EMD-A" ? 2 : 4;
}

function getModalColumnDefs(modalTitle, onPnrClick) {
  const pnrCol = {
    key: "pnr",
    header: "PNR",
    render: (r) => (
      <button
        type="button"
        className="text-brand-red hover:underline font-medium"
        onClick={() => onPnrClick?.(r)}
        title="Open PNR details"
      >
        {display(r.pnr)}
      </button>
    ),
  };

  const ancillaryIdCol = {
    key: "ancillaryId",
    header: "Ancillary ID",
    render: (r) => (
      <button
        type="button"
        className="text-black"
        onClick={() => onPnrClick?.(r)}
        title="Open PNR details"
      >
        {display(r.ancillaryId)}
      </button>
    ),
  };

  const airlineCol = {
    key: "airline",
    header: "Airline",
    render: (r) => display(r.airline),
  };

  const documentTypeCol = {
    key: "documentType",
    header: "Document Type",
    render: (r) => (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          r.documentType === "EMD-A"
            ? "bg-blue-100 text-blue-700"
            : "bg-purple-100 text-purple-700"
        }`}
      >
        {display(r.documentType)}
      </span>
    ),
  };

  const emdTypeCol = {
    key: "emdType",
    header: "EMD Type",
    render: (r) => (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          r.emdType === "EMD-A"
            ? "bg-blue-100 text-blue-700"
            : "bg-purple-100 text-purple-700"
        }`}
      >
        {display(r.emdType)}
      </span>
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
    render: (r) => display(r.assigned),
  };

  const stageCol = {
    key: "stage",
    header: "Stage",
    render: (r) => display(r.stage),
  };

  const createdAtCol = {
    key: "createdAt",
    header: "Date Created",
    render: (r) =>
      r.createdAt
        ? new Date(r.createdAt).toLocaleString(DATE_LOCALE, {
            timeZone: DATE_TZ,
          })
        : "-",
  };

  const errorClassCol = {
    key: "errorClass",
    header: "Error Details",
    render: (r) => (
      <span title={display(r.errorClass)} className="block max-w-xs truncate">
        {display(r.errorClass)}
      </span>
    ),
  };

  const completionCol = {
    key: "completionMinutes",
    header: "Completion Time",
    render: (r) =>
      r.completionMinutes != null ? r.completionMinutes + "m" : "-",
  };

  const slaCol = {
    key: "slaMinutes",
    header: "SLA",
    render: (r) =>
      r.slaMinutes + "m" ?? getSlaMinutesForDocType(r.documentType) + "m",
  };

  const triageTimeCol = {
    key: "triageTime",
    header: "Triage",
    render: (r) => (r.triageTime != null ? `${r.triageTime}m` : "-"),
  };

  const maskCheckTimeCol = {
    key: "maskCheckTime",
    header: "Mask Check",
    render: (r) => (r.maskCheckTime != null ? `${r.maskCheckTime}m` : "-"),
  };

  const dealMatchingTimeCol = {
    key: "dealMatchingTime",
    header: "Deal Matching",
    render: (r) =>
      r.dealMatchingTime != null ? `${r.dealMatchingTime}m` : "-",
  };

  const issuanceTimeCol = {
    key: "issuanceTime",
    header: "Issuance",
    render: (r) => (r.issuanceTime != null ? `${r.issuanceTime}m` : "-"),
  };

  const invoicingTimeCol = {
    key: "invoicingTime",
    header: "Invoicing",
    render: (r) => (r.invoicingTime != null ? `${r.invoicingTime}m` : "-"),
  };

  const admCol = {
    key: "adm",
    header: "Is ADM?",
    render: (r) => (
      <span className={r.adm ? "text-red-600 font-medium" : "text-black/50"}>
        {r.adm ? "YES" : "NO"}
      </span>
    ),
  };

  const feedbackCol = {
    key: "feedback",
    header: "Feedback",
    render: (r) =>
      display(r.feedbackText || r.feedback) !== "-"
        ? display(r.feedbackText || r.feedback)
        : "-",
  };

  const feedbackTextCol = {
    key: "feedbackText",
    header: "Feedback",
    render: (r) => (
      <span
        title={display(r.feedbackText)}
        className="block max-w-[260px] truncate"
      >
        {display(r.feedbackText)}
      </span>
    ),
  };

  const emdNumberCol = {
    key: "emdNumber",
    header: "EMD Number",
    render: (r) => display(r.emdNumber),
  };

  const slaBreachedCol = {
    key: "slaBreached",
    header: "Is SLA Breached?",
    render: (r) => {
      const type = display(r.slaBreached);
      return (
        <span
          className={
            type === "YES" ? "text-red-600 font-medium" : "text-black/50"
          }
        >
          {type}
        </span>
      );
    },
  };

  const slaStartTimeCol = {
    key: "slaStartTime",
    header: "SLA Start Time",
    render: (r) =>
      r.slaStartTime
        ? new Date(r.slaStartTime).toLocaleString(DATE_LOCALE, {
            timeZone: DATE_TZ,
          })
        : "-",
  };

  const processingTimeCol = {
    key: "processingMinutes",
    header: "Processing Time",
    render: (r) =>
      r.processingMinutes != null ? `${r.processingMinutes}m` : "-",
  };

  const completionTimeCol = {
    key: "completionTimeAt",
    header: "Completion Time",
    render: (r) =>
      r.completionTimeAt
        ? new Date(r.completionTimeAt).toLocaleString(DATE_LOCALE, {
            timeZone: DATE_TZ,
          })
        : "-",
  };

  const resolutionStatusCol = {
    key: "resolutionStatus",
    header: "Resolution Status",
    render: (r) => {
      const st = display(r.resolutionStatus);
      if (st === "-") return "-";
      const cls =
        st === "Resolved"
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700";
      return (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
        >
          {st}
        </span>
      );
    },
  };

  const aiRficCol = {
    key: "aiRFIC",
    header: "AI-inferred RFIC",
    render: (r) => (
      <span className="font-mono text-blue-700">{display(r.aiRFIC)}</span>
    ),
  };

  const aiRfiscCol = {
    key: "aiRFISC",
    header: "AI-inferred RFISC",
    render: (r) => (
      <span className="font-mono text-blue-700">{display(r.aiRFISC)}</span>
    ),
  };

  const aiEmdDescCol = {
    key: "aiEmdDesc",
    header: "AI-inferred EMD Desc",
    render: (r) => display(r.aiEmdDesc),
  };

  const correctedRficCol = {
    key: "correctedRFIC",
    header: "Corrected RFIC",
    render: (r) => (
      <span className="font-mono text-orange-700">
        {display(r.correctedRFIC)}
      </span>
    ),
  };

  const correctedRfiscCol = {
    key: "correctedRFISC",
    header: "Corrected RFISC",
    render: (r) => (
      <span className="font-mono text-orange-700">
        {display(r.correctedRFISC)}
      </span>
    ),
  };

  const correctedEmdDescCol = {
    key: "correctedEmdDesc",
    header: "Corrected EMD Desc",
    render: (r) => (
      <span className="text-orange-700">{display(r.correctedEmdDesc)}</span>
    ),
  };

  const accuracyCol = {
    key: "llm.accuracy",
    header: "Accuracy",
    render: (r) => (r.llm?.accuracy != null ? pct(r.llm.accuracy) : "-"),
  };

  const coherenceCol = {
    key: "llm.coherence",
    header: "Coherence",
    render: (r) => (r.llm?.coherence != null ? pct(r.llm.coherence) : "-"),
  };

  const consistencyCol = {
    key: "llm.consistency",
    header: "Consistency",
    render: (r) => (r.llm?.consistency != null ? pct(r.llm.consistency) : "-"),
  };

  const groundednessCol = {
    key: "llm.groundedness",
    header: "Groundedness",
    render: (r) =>
      r.llm?.groundedness != null ? pct(r.llm.groundedness) : "-",
  };

  const configs = {
    Throughput: [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "Avg Completion Time": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      triageTimeCol,
      maskCheckTimeCol,
      dealMatchingTimeCol,
      issuanceTimeCol,
      invoicingTimeCol,
      completionCol,
      slaCol,
    ],
    "Error Rate": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      slaStartTimeCol,
      processingTimeCol,
      errorClassCol,
      resolutionStatusCol,
    ],
    Exceptions: [
      pnrCol,
      ancillaryIdCol,
      airlineCol,
      emdTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      slaBreachedCol,
      slaCol,
      processingTimeCol,
      admCol,
      feedbackCol,
      errorClassCol,
    ],
    "Throughput over time": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "AI vs Human corrections": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      createdAtCol,
      aiRficCol,
      aiRfiscCol,
      aiEmdDescCol,
      correctedRficCol,
      correctedRfiscCol,
      correctedEmdDescCol,
      completionCol,
    ],
    "End-to-end completion time": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      triageTimeCol,
      maskCheckTimeCol,
      dealMatchingTimeCol,
      issuanceTimeCol,
      invoicingTimeCol,
      completionCol,
      slaCol,
    ],
    "Assignments to ticketers": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "Error visibility & classification": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      assignedCol,
      stageCol,
      createdAtCol,
      errorClassCol,
    ],
    "PNRs requiring Human-in-the-Loop (HIL)": [
      pnrCol,
      assignedCol,
      stageCol,
      createdAtCol,
    ],
    "PNRs with feedback (any ADM status)": [
      pnrCol,
      emdNumberCol,
      assignedCol,
      feedbackTextCol,
      admCol,
    ],
    "SLA breached PNRs": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      assignedCol,
      slaCol,
      completionCol,
    ],
    ADMs: [pnrCol, emdNumberCol, assignedCol, feedbackTextCol],
    "LLM metrics (avg in range)": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      stageCol,
      createdAtCol,
      slaCol,
    ],
    "LLM metrics trend over time": [
      pnrCol,
      airlineCol,
      documentTypeCol,
      statusCol,
      stageCol,
      createdAtCol,
      accuracyCol,
      coherenceCol,
      consistencyCol,
      groundednessCol,
    ],
  };

  const baseTitle = Object.keys(configs).find((k) => modalTitle?.startsWith(k));
  return configs[baseTitle] || configs.Throughput;
}

// --------------------------------------------------
// UI primitives
// --------------------------------------------------
function DetailModal({ open, title, subtitle, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center mt-4">
        <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl h-[530px]">
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
              className="btn h-8 px-2"
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>
          <div className="p-3 h-[calc(80vh-64px)]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function PnrModal({
  open,
  selectedPnr,
  selectedStatus,
  onClose,
  onOpenDashboard,
}) {
  if (!open) return null;
  const selected = { pnr: selectedPnr, status: selectedStatus || "-" };
  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center mt-4">
        <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl h-[80vh]">
          <div className="flex items-start justify-between gap-4 border-b border-black/10 p-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-black"></div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn h-8 px-2"
                onClick={onClose}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="p-4 overflow-auto h-[calc(80vh-64px)]">
            <PNRDetails selected={selected} />
          </div>
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
  loading,
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
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-black/70">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-black/50">
            {title}
          </div>
          {onClick ? (
            <button
              type="button"
              className="mt-1 inline-flex items-baseline gap-2 rounded-lg px-2 py-0.5 text-xl font-semibold text-black hover:bg-black/[0.04]"
              title={clickTitle || "Click to view details"}
              onClick={onClick}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : <span>{value}</span>}
            </button>
          ) : (
            <div className="mt-1 text-xl font-semibold text-black">
              {loading ? <Spinner size="sm" /> : value}
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
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-black">{title}</h2>
          {subtitle ? (
            <p className="text-xs text-black/60">{subtitle}</p>
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
                    {typeof c.render === "function"
                      ? c.render(r)
                      : display(r[c.key])}
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

function ClickableTooltip({ active, payload, label, metricLabel, onPick }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3 shadow-lg">
      <div className="text-sm font-medium text-black">{display(label)}</div>
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
                <span className="text-black/70">{display(seriesName)}</span>
              </span>
              <span className="font-semibold text-black">{display(val)}</span>
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

// --------------------------------------------------
// API -> Row mapping (for modals/tables)
// --------------------------------------------------
function mapCommonItemToRow(item) {
  if (!item) return null;
  const createdAt =
    item.queue_arrival_utc ||
    item.created_at_utc ||
    item.sla_start_time_utc ||
    item.completion_time_utc ||
    null;
  return {
    id: item.emd_item_id || item.pnr_id || item.id,
    pnr: item.pnr_id || "-",
    ancillaryId: item.ancillary_item_id || "test",
    airline: item.airline_names || "-",
    documentType: item.document_type || "-",
    emdType: item.emd_type || "-",
    status: item.status || "-",
    assigned:
      item.assigned_to == null ? "Unassigned" : item.assigned_to || "null",
    stage: item.stage || "-",
    createdAt,
    errorClass: item.error_details || item.human_error || "-",
  };
}

function mapAvgCompletionItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  // stage durations are ms in API; we display as minutes in modal
  const triageMs = item.triage_total_completion_time;
  const maskMs = item.mask_total_completion_time;
  const dealMs = item.deal_matching_total_completion_time;
  const issuanceMs = item.issuance_total_completion_time;
  const invoicingMs = item.invoicing_total_completion_time;
  // const msToMins = (ms) => (ms == null ? null : Math.round(ms / 60000));
  // If server provides completion_time as a string, prefer it
  const totalMins = item.completion_time;
  const slaMins = item.sla;
  return {
    ...base,
    status:
      normalizeStatus(base.status) === "-" ||
      normalizeStatus(base.status) === "completed" ||
      normalizeStatus(base.status) === "complete"
        ? "processed"
        : normalizeStatus(base.status),
    // triageTime: msToMins(triageMs),
    // maskCheckTime: msToMins(maskMs),
    // dealMatchingTime: msToMins(dealMs),
    // issuanceTime: msToMins(issuanceMs),
    triageTime: triageMs,
    maskCheckTime: maskMs,
    dealMatchingTime: dealMs,
    issuanceTime: issuanceMs,
    invoicingTime: invoicingMs,
    completionMinutes: totalMins,
    slaMinutes: slaMins,
  };
}

function mapErrorRateItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  return {
    ...base,
    slaStartTime: item.sla_start_time_utc || null,
    processingMinutes: secondsToMinutes(item.processing_time_seconds),
    completionTimeAt: item.completion_time_utc || null,
    errorClass: item.error_details || base.errorClass,
    resolutionStatus: item.error_resolved_at_utc ? "Resolved" : "Open",
  };
}

function mapExceptionItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  const isAdm = Boolean(item.is_adm);

  return {
    ...base,
    status:
      normalizeStatus(base.status) === "-"
        ? "error"
        : normalizeStatus(base.status),
    slaBreached: item.sla_breached || "-",
    slaMinutes:
      coerceNumber(item.sla) ??
      getSlaMinutesForDocType(item.document_type || base.documentType),
    adm: isAdm,
    feedbackText: item.feedback || "-",
    feedback: item.feedback || "-",
    slaStartTime: item.sla_start_time_utc || null,
    processingMinutes: item.processing_time,
    completionTimeAt: item.completion_time_utc || null,
  };
}

function mapAiVsHumanItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  const completionMinutes = item.completion_time_minutes;
  return {
    ...base,
    status:
      normalizeStatus(base.status) === "-" ||
      normalizeStatus(base.status) === "completed" ||
      normalizeStatus(base.status) === "complete"
        ? "processed"
        : normalizeStatus(base.status),
    createdAt: item.queue_arrival_utc || base.createdAt,
    completionMinutes,
    aiRFIC: item.ai_suggested_rfic || "-",
    aiRFISC: item.ai_suggested_rfisc || "-",
    aiEmdDesc: item.ai_suggested_emd_desc || "-",
    correctedRFIC: item.human_corrected_rfic || "-",
    correctedRFISC: item.human_corrected_rfisc || "-",
    correctedEmdDesc: item.human_corrected_emd_desc || "-",
  };
}

function mapEndToEndItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  return {
    ...base,
    status:
      normalizeStatus(base.status) === "-" ||
      normalizeStatus(base.status) === "completed" ||
      normalizeStatus(base.status) === "complete"
        ? "processed"
        : normalizeStatus(base.status),
    createdAt: item.queue_arrival_utc || base.createdAt,
    emdNumber: item.emd_number || "-",
    triageTime: item.triage_total_completion_time,
    maskCheckTime: item.mask_total_completion_time,
    dealMatchingTime: item.deal_matching_total_completion_time,
    issuanceTime: item.issuance_total_completion_time,
    invoicingTime: item.invoicing_total_completion_time,
    completionMinutes: item.completion_time,
    slaMinutes: item.sla ?? getSlaMinutesForDocType(base.documentType),
  };
}

function mapHilItemToRow(item) {
  if (!item) return null;
  return {
    id: item.pnr_id || item.id,
    pnr: item.pnr_id || "-",
    stage: item.stage || "-",
    assigned: item.assigned_to || "-",
    createdAt: item.queue_arrival_utc || null,
    status: "human",
  };
}

function mapPnrAdmItemToRow(item) {
  if (!item) return null;
  return {
    id: item.pnr_id || item.id,
    pnr: item.pnr_id || "-",
    emdNumber: item.emd_number || "-",
    assigned: item.assigned_to || "-",
    feedbackText: item.feedback || "-",
    adm: Boolean(item.is_adm),
    status: "processed",
  };
}

function mapAssignmentItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  return { ...base, createdAt: item.queue_arrival_utc || base.createdAt };
}

function mapErrorVisibilityItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  return {
    ...base,
    errorClass: item.human_error || item.error_details || base.errorClass,
    createdAt: item.queue_arrival_utc || base.createdAt,
  };
}

function mapLlmListItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  return {
    ...base,
    status:
      normalizeStatus(base.status) === "-" ||
      normalizeStatus(base.status) === "completed" ||
      normalizeStatus(base.status) === "complete"
        ? "processed"
        : normalizeStatus(base.status),
    createdAt: item.queue_arrival_utc || base.createdAt,
    slaMinutes: coerceNumber(item.sla),
  };
}

function mapLlmTrendListItemToRow(item) {
  const base = mapCommonItemToRow(item) || {};
  return {
    ...base,
    status:
      normalizeStatus(base.status) === "-" ||
      normalizeStatus(base.status) === "completed" ||
      normalizeStatus(base.status) === "complete"
        ? "processed"
        : normalizeStatus(base.status),
    createdAt: item.queue_arrival_utc || base.createdAt,
    emdNumber: item.emd_number || "-",
    llm: {
      accuracy: normalizePercentage01(item.accuracy) ?? null,
      consistency: normalizePercentage01(item.consistency) ?? null,
      coherence: normalizePercentage01(item.coherence) ?? null,
      groundedness: normalizePercentage01(item.groundedness) ?? null,
    },
  };
}

// --------------------------------------------------
// Main Component
// --------------------------------------------------
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

  // PNR Details modal
  const [pnrModalOpen, setPnrModalOpen] = useState(false);
  const [pnrModalPnr, setPnrModalPnr] = useState("");
  const [pnrModalStatus, setPnrModalStatus] = useState("");

  const openPnrDetails = (rowOrPnr) => {
    const pnr = typeof rowOrPnr === "string" ? rowOrPnr : rowOrPnr?.pnr;
    if (!pnr || pnr === "-") return;
    setPnrModalPnr(pnr);
    setPnrModalStatus(typeof rowOrPnr === "object" ? rowOrPnr?.status : "-");
    setPnrModalOpen(true);

    appLogger.info("REPORT_PNR_DETAILS_OPENED", {
      component: "ReportsModule",
      pnr,
      status: typeof rowOrPnr === "object" ? rowOrPnr?.status : "-",
    });
  };

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

  // Modal performance controls (pagination / virtualization)
  const [detailRenderMode, setDetailRenderMode] = useState("paged"); // paged | virtual
  const [detailPageSize, setDetailPageSize] = useState(50);
  const [detailPage, setDetailPage] = useState(1);
  const virtualBodyRef = useRef(null);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  const VROW_H = 36;
  const VVIEW_H = 320;
  const V_OVERSCAN = 8;

  const closeDetailModal = () => setDetailOpen(false);

  const openDetailModal = ({ title, subtitle, rows } = {}) => {
    const baseTitle =
      Object.keys(MODAL_CONFIG).find((k) => title?.startsWith(k)) || title;
    const modalConfig = MODAL_CONFIG[baseTitle] || MODAL_CONFIG[title] || null;

    const applyStatusRules = (list) => {
      if (!modalConfig?.statuses) return list;
      return list.filter((r) =>
        modalConfig.statuses.includes(normalizeStatus(r.status)),
      );
    };

    let finalRows = Array.isArray(rows) ? rows : [];
    finalRows = applyStatusRules(finalRows);

    setDetailTitle(title || "Details");
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

    appLogger.info("REPORT_DETAIL_MODAL_OPENED", {
      component: "ReportsModule",
      title: title || "Details",
      subtitle: subtitle || "",
      rowCount: Array.isArray(rows) ? rows.length : 0,
    });
  };

  // ------------------------------
  // Data states (initially zeros / empty)
  // ------------------------------
  const reqRef = useRef({ id: 0, controller: null });

  const [dashSummary, setDashSummary] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashErr, setDashErr] = useState("");

  const [throughputOT, setThroughputOT] = useState({ chart: [], items: [] });
  const [throughputOTLoading, setThroughputOTLoading] = useState(false);
  const [throughputOTErr, setThroughputOTErr] = useState("");

  const [aiHuman, setAiHuman] = useState({ chart: [], list: [] });
  const [aiHumanLoading, setAiHumanLoading] = useState(false);
  const [aiHumanErr, setAiHumanErr] = useState("");

  const [e2e, setE2e] = useState({ chart: [], list: [] });
  const [e2eLoading, setE2eLoading] = useState(false);
  const [e2eErr, setE2eErr] = useState("");

  const [assignments, setAssignments] = useState({ chart: [], list: [] });
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsErr, setAssignmentsErr] = useState("");

  const [errorVis, setErrorVis] = useState({ chart: [], list: [] });
  const [errorVisLoading, setErrorVisLoading] = useState(false);
  const [errorVisErr, setErrorVisErr] = useState("");

  const [hil, setHil] = useState([]);
  const [hilLoading, setHilLoading] = useState(false);
  const [hilErr, setHilErr] = useState("");

  const [pnrAdm, setPnrAdm] = useState([]);
  const [pnrAdmLoading, setPnrAdmLoading] = useState(false);
  const [pnrAdmErr, setPnrAdmErr] = useState("");

  const [llmAvg, setLlmAvg] = useState({ chart: [], list: [] });
  const [llmAvgLoading, setLlmAvgLoading] = useState(false);
  const [llmAvgErr, setLlmAvgErr] = useState("");

  const [llmTrend, setLlmTrend] = useState({ chart: [], list: [] });
  const [llmTrendLoading, setLlmTrendLoading] = useState(false);
  const [llmTrendErr, setLlmTrendErr] = useState("");

  const anyLoading =
    dashLoading ||
    throughputOTLoading ||
    aiHumanLoading ||
    e2eLoading ||
    assignmentsLoading ||
    errorVisLoading ||
    hilLoading ||
    pnrAdmLoading ||
    llmAvgLoading ||
    llmTrendLoading;

  const anyError =
    dashErr ||
    throughputOTErr ||
    aiHumanErr ||
    e2eErr ||
    assignmentsErr ||
    errorVisErr ||
    hilErr ||
    pnrAdmErr ||
    llmAvgErr ||
    llmTrendErr;

  async function loadTabData(
    activeTab,
    {
      start_date = from,
      end_date = to,
      includeDashboardSummary = activeTab === SUBTABS.OVERVIEW,
    } = {},
  ) {
    appLogger.info("REPORT_DATA_LOAD_STARTED", {
      component: "ReportsModule",
      activeTab,
      start_date,
      end_date,
      includeDashboardSummary,
    });

    // Per-tab lazy loading: only fetch what the active tab needs.
    // Abort previous request for this tab only
    reqRef.current.controllers = reqRef.current.controllers || {};
    if (reqRef.current.controllers[activeTab]) {
      reqRef.current.controllers[activeTab].abort();
    }

    const controller = new AbortController();
    reqRef.current.controllers[activeTab] = controller;

    // Bump request id for stale protection
    reqRef.current.id += 1;
    const reqId = reqRef.current.id;
    const signal = controller.signal;

    const withRange = { start_date, end_date, signal };

    const needs = {
      dash: includeDashboardSummary,
      throughputOT: activeTab === SUBTABS.OVERVIEW,
      aiHuman: activeTab === SUBTABS.OVERVIEW || activeTab === SUBTABS.AI,
      e2e: activeTab === SUBTABS.OPS || activeTab === SUBTABS.EXCEPTIONS,
      assignments: activeTab === SUBTABS.OPS,
      errorVis: activeTab === SUBTABS.OPS,
      hil: activeTab === SUBTABS.QUALITY,
      pnrAdm: activeTab === SUBTABS.QUALITY || activeTab === SUBTABS.EXCEPTIONS,
      llmAvg: activeTab === SUBTABS.AI,
      llmTrend: activeTab === SUBTABS.AI,
    };

    if (needs.dash) {
      setDashLoading(true);
      setDashErr("");
    }
    if (needs.throughputOT) {
      setThroughputOTLoading(true);
      setThroughputOTErr("");
    }
    if (needs.aiHuman) {
      setAiHumanLoading(true);
      setAiHumanErr("");
    }
    if (needs.e2e) {
      setE2eLoading(true);
      setE2eErr("");
    }
    if (needs.assignments) {
      setAssignmentsLoading(true);
      setAssignmentsErr("");
    }
    if (needs.errorVis) {
      setErrorVisLoading(true);
      setErrorVisErr("");
    }
    if (needs.hil) {
      setHilLoading(true);
      setHilErr("");
    }
    if (needs.pnrAdm) {
      setPnrAdmLoading(true);
      setPnrAdmErr("");
    }
    if (needs.llmAvg) {
      setLlmAvgLoading(true);
      setLlmAvgErr("");
    }
    if (needs.llmTrend) {
      setLlmTrendLoading(true);
      setLlmTrendErr("");
    }

    const requests = [];
    if (needs.dash)
      requests.push({ k: "dash", p: getDashboardSummary(withRange) });
    if (needs.throughputOT)
      requests.push({
        k: "throughputOT",
        p: getThroughputOverTime(withRange),
      });
    if (needs.aiHuman)
      requests.push({ k: "aiHuman", p: getAiVsHumanCorrections(withRange) });
    if (needs.e2e)
      requests.push({ k: "e2e", p: getEndToEndAvgTime(withRange) });
    if (needs.assignments)
      requests.push({
        k: "assignments",
        p: getAssignmentsToTicketers(withRange),
      });
    if (needs.errorVis)
      requests.push({
        k: "errorVis",
        p: getErrorVisibilityClassification(withRange),
      });
    if (needs.hil) requests.push({ k: "hil", p: getHilPnrs(withRange) });
    if (needs.pnrAdm) requests.push({ k: "pnrAdm", p: getPnrAdm(withRange) });
    if (needs.llmAvg)
      requests.push({ k: "llmAvg", p: getLlmMetricsAvgInRange(withRange) });
    if (needs.llmTrend)
      requests.push({
        k: "llmTrend",
        p: getLlmMetricsTrendOverTime(withRange),
      });

    const settled = await Promise.allSettled(requests.map((r) => r.p));

    appLogger.info("REPORT_DATA_LOAD_COMPLETED", {
      component: "ReportsModule",
      activeTab,
    });

    if (reqRef.current.id !== reqId || signal.aborted) return;

    for (let i = 0; i < requests.length; i++) {
      const keyName = requests[i].k;
      const res = settled[i];
      const ok = res.status === "fulfilled";
      const val = ok ? res.value : null;
      const err = ok ? "" : res.reason?.data?.detail || "Failed.";

      if (!ok) {
        appLogger.error("REPORT_WIDGET_LOAD_FAILED", {
          component: "ReportsModule",
          activeTab,
          widget: keyName,
          message: err,
        });
      }

      if (keyName === "dash") {
        setDashSummary(val);
        setDashErr(err);
        setDashLoading(false);
      }
      if (keyName === "throughputOT") {
        setThroughputOT({
          chart: Array.isArray(val?.chart) ? val.chart : [],
          items: Array.isArray(val?.items) ? val.items : [],
        });
        setThroughputOTErr(err);
        setThroughputOTLoading(false);
      }
      if (keyName === "aiHuman") {
        setAiHuman({
          chart: Array.isArray(val?.chart) ? val.chart : [],
          list: Array.isArray(val?.list) ? val.list : [],
        });
        setAiHumanErr(err);
        setAiHumanLoading(false);
      }
      if (keyName === "e2e") {
        setE2e({
          chart: Array.isArray(val?.chart) ? val.chart : [],
          list: Array.isArray(val?.list) ? val.list : [],
        });
        setE2eErr(err);
        setE2eLoading(false);
      }
      if (keyName === "assignments") {
        setAssignments({
          chart: Array.isArray(val?.chart) ? val.chart : [],
          list: Array.isArray(val?.list) ? val.list : [],
        });
        setAssignmentsErr(err);
        setAssignmentsLoading(false);
      }
      if (keyName === "errorVis") {
        setErrorVis({
          chart: Array.isArray(val?.chart) ? val.chart : [],
          list: Array.isArray(val?.list) ? val.list : [],
        });
        setErrorVisErr(err);
        setErrorVisLoading(false);
      }
      if (keyName === "hil") {
        setHil(Array.isArray(val?.list) ? val.list : []);
        setHilErr(err);
        setHilLoading(false);
      }
      if (keyName === "pnrAdm") {
        setPnrAdm(Array.isArray(val?.list) ? val.list : []);
        setPnrAdmErr(err);
        setPnrAdmLoading(false);
      }
      if (keyName === "llmAvg") {
        setLlmAvg({
          chart: Array.isArray(val?.chart) ? val.chart : [],
          list: Array.isArray(val?.list) ? val.list : [],
        });
        setLlmAvgErr(err);
        setLlmAvgLoading(false);
      }
      if (keyName === "llmTrend") {
        setLlmTrend({
          chart: Array.isArray(val?.chart) ? val.chart : [],
          list: Array.isArray(val?.list) ? val.list : [],
        });
        setLlmTrendErr(err);
        setLlmTrendLoading(false);
      }
    }
  }

  // initial load and range changes + tab changes (lazy)
  const prevFiltersRef = useRef({ subTab: null, from: null, to: null });

  useEffect(() => {
    const prev = prevFiltersRef.current;

    const tabChanged = prev.subTab !== null && prev.subTab !== subTab;
    const dateChanged =
      prev.from !== null &&
      prev.to !== null &&
      (prev.from !== from || prev.to !== to);

    const isInitialLoad = prev.subTab === null;

    loadTabData(subTab, {
      start_date: from,
      end_date: to,
      includeDashboardSummary:
        isInitialLoad || subTab === SUBTABS.OVERVIEW || dateChanged,
    });

    prevFiltersRef.current = { subTab, from, to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, from, to]);

  // ------------------------------
  // Derived values for UI
  // ------------------------------
  const dashKpis = useMemo(() => {
    const s = dashSummary && dashSummary.success ? dashSummary : null;
    const throughputCount = coerceNumber(s?.throughput?.data?.count) ?? 0;
    const avgMins = s?.avgCompletionTime?.data?.avgMins ?? 0;
    const avgItems = Array.isArray(s?.avgCompletionTime?.data?.items)
      ? s.avgCompletionTime.data.items
      : [];
    const errPct01 = normalizePercentage01(s?.errorRate?.data?.percentage) ?? 0;
    const errorCount = coerceNumber(s?.errorRate?.data?.errorCount) ?? 0;
    const hilCount = coerceNumber(s?.errorRate?.data?.hilCount) ?? 0;
    const exc = s?.exceptions?.data;
    const slaCount = coerceNumber(exc?.slaCount) ?? 0;
    const slaACount = coerceNumber(exc?.slaACount) ?? 0;
    const slaSCount = coerceNumber(exc?.slaSCount) ?? 0;
    const admCount = coerceNumber(exc?.admCount) ?? 0;
    const withFeedbackCount = coerceNumber(exc?.withFeedbackCount) ?? 0;
    return {
      throughputCount,
      throughputItems: Array.isArray(s?.throughput?.data?.items)
        ? s.throughput.data.items
        : [],
      avgMins,
      avgItems,
      errorPct01: errPct01,
      errorCount,
      hilCount,
      errorItems: Array.isArray(s?.errorRate?.data?.items)
        ? s.errorRate.data.items
        : [],
      exceptionItems: Array.isArray(exc?.items) ? exc.items : [],
      slaCount,
      slaACount,
      slaSCount,
      admCount,
      withFeedbackCount,
    };
  }, [dashSummary]);

  const throughputOverTimeChart = useMemo(() => {
    const arr = Array.isArray(throughputOT.chart) ? throughputOT.chart : [];
    return arr.map((r) => {
      const key = r.date;
      const dateKey = toDateKey(key) || key;
      return {
        key: dateKey,
        date: fmtShortDate(dateKey),
        processed: coerceNumber(r.processed) ?? 0,
        error: coerceNumber(r.error) ?? 0,
        human: coerceNumber(r.human) ?? 0,
        __raw: r,
      };
    });
  }, [throughputOT.chart]);

  const aiVsHumanChart = useMemo(() => {
    const arr = Array.isArray(aiHuman.chart) ? aiHuman.chart : [];
    return arr.map((r) => ({
      name: r.name || "-",
      value: coerceNumber(r.value) ?? 0,
      __raw: r,
    }));
  }, [aiHuman.chart]);

  const e2eChart = useMemo(() => {
    const arr = Array.isArray(e2e.chart) ? e2e.chart : [];
    return arr.map((r) => {
      const key = r.date;
      const dateKey = toDateKey(key) || key;
      return {
        key: dateKey,
        date: fmtShortDate(dateKey),
        avgCompletion: coerceNumber(r.avgCompletionTime) ?? 0,
        __raw: r,
      };
    });
  }, [e2e.chart]);

  const assignmentsChart = useMemo(() => {
    const arr = Array.isArray(assignments.chart) ? assignments.chart : [];
    return arr
      .map((r) => ({
        name: r.assignee || "null",
        count: coerceNumber(r.count) ?? 0,
        __raw: r,
      }))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [assignments.chart]);

  const errorClassChart = useMemo(() => {
    const arr = Array.isArray(errorVis.chart) ? errorVis.chart : [];
    return arr
      .map((r) => ({
        name: r.error || "-",
        count: coerceNumber(r.count) ?? 0,
        __raw: r,
      }))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [errorVis.chart]);

  const hilRows = useMemo(
    () => (Array.isArray(hil) ? hil.map(mapHilItemToRow).filter(Boolean) : []),
    [hil],
  );

  const feedbackRows = useMemo(() => {
    const list = Array.isArray(pnrAdm) ? pnrAdm : [];
    return list
      .map(mapPnrAdmItemToRow)
      .filter(Boolean)
      .filter((x) => display(x.feedbackText) !== "-");
  }, [pnrAdm]);

  const admRows = useMemo(() => {
    const list = Array.isArray(pnrAdm) ? pnrAdm : [];
    return list
      .map(mapPnrAdmItemToRow)
      .filter(Boolean)
      .filter((x) => x.adm);
  }, [pnrAdm]);

  const e2eListRows = useMemo(
    () =>
      Array.isArray(e2e.list)
        ? e2e.list.map(mapEndToEndItemToRow).filter(Boolean)
        : [],
    [e2e.list],
  );

  const slaBreachedRows = useMemo(() => {
    return e2eListRows
      .map((r) => ({
        ...r,
        slaMinutes: r.slaMinutes ?? getSlaMinutesForDocType(r.documentType),
      }))
      .filter((r) => {
        const c = parseFloat(r.completionMinutes);
        const sla = parseFloat(r.slaMinutes);
        if (c == null || sla == null) return false;
        return c > sla;
      });
  }, [e2eListRows]);

  const llmRadar = useMemo(() => {
    const arr = Array.isArray(llmAvg.chart) ? llmAvg.chart : [];
    return arr.map((r) => ({
      metric: r.metric || "-",
      value: clamp01(coerceNumber(r.score) ?? 0),
      __raw: r,
    }));
  }, [llmAvg.chart]);

  const llmTrendChart = useMemo(() => {
    const arr = Array.isArray(llmTrend.chart) ? llmTrend.chart : [];
    return arr.map((r) => {
      const key = r.date;
      const dateKey = toDateKey(key) || key;
      return {
        key: dateKey,
        date: fmtShortDate(dateKey),
        accuracy: clamp01(normalizePercentage01(r.accuracy) ?? 0),
        consistency: clamp01(normalizePercentage01(r.consistency) ?? 0),
        coherence: clamp01(normalizePercentage01(r.coherence) ?? 0),
        groundedness: clamp01(normalizePercentage01(r.groundedness) ?? 0),
        __raw: r,
      };
    });
  }, [llmTrend.chart]);

  // ------------------------------
  // Drilldown pickers
  // ------------------------------
  const openThroughputCardModal = () => {
    const rows = dashKpis.throughputItems
      .map(mapCommonItemToRow)
      .filter(Boolean);
    openDetailModal({
      title: "Throughput",
      subtitle: `PNRs created in range • ${rows.length} rows`,
      rows,
    });
  };

  const openAvgCompletionCardModal = () => {
    const rows = dashKpis.avgItems
      .map(mapAvgCompletionItemToRow)
      .filter(Boolean);
    openDetailModal({
      title: "Avg Completion Time",
      subtitle: `Rows contributing to avg • ${rows.length} rows`,
      rows,
    });
  };

  const openErrorRateCardModal = () => {
    const rows = dashKpis.errorItems.map(mapErrorRateItemToRow).filter(Boolean);
    openDetailModal({
      title: "Error Rate",
      subtitle: `${rows.length} rows • ${dashKpis.errorCount} errors • ${dashKpis.hilCount} HIL`,
      rows,
    });
  };

  const openExceptionsCardModal = () => {
    const rows = dashKpis.exceptionItems
      .map(mapExceptionItemToRow)
      .filter(Boolean);
    openDetailModal({
      title: "Exceptions",
      subtitle: `${rows.length} rows • ${dashKpis.slaCount} SLA • ${dashKpis.admCount} ADM • ${dashKpis.withFeedbackCount} with feedback`,
      rows,
    });
  };

  const handleChartPick = ({ metricLabel, label, seriesName, value }) => {
    let rows = [];

    appLogger.info("REPORT_CHART_DRILLDOWN_CLICKED", {
      component: "ReportsModule",
      metricLabel,
      label,
      seriesName,
      value,
    });

    if (metricLabel === "Throughput over time") {
      const dayRow =
        throughputOverTimeChart.find((d) => d.date === label) ||
        throughputOverTimeChart.find((d) => d.key === label);
      const dayKey = dayRow?.key;

      rows = throughputOT.items.map(mapCommonItemToRow).filter(Boolean);
      if (dayKey) {
        rows = rows.filter((x) => toDateKey(x.createdAt) === dayKey);
      }

      if (seriesName === "Processed")
        rows = rows.filter((x) => normalizeStatus(x.status) === "processed");
      if (seriesName === "Human")
        rows = rows.filter((x) => normalizeStatus(x.status) === "human");
      if (seriesName === "Error")
        rows = rows.filter((x) => normalizeStatus(x.status) === "error");

      openDetailModal({
        title: `Throughput over time${label ? ` — ${label}` : ""}`,
        subtitle: ``,
        rows,
      });
      return;
    }

    if (
      metricLabel === "AI vs Human corrections" ||
      metricLabel === "AI RFIC/RFISC vs Human corrections"
    ) {
      rows = aiHuman.list.map(mapAiVsHumanItemToRow).filter(Boolean);

      if (label) {
        // interpret label as chart segment name (make filtering resilient to naming)
        const ll = String(label).toLowerCase();

        const hasHuman = (x) =>
          display(x.correctedRFIC) !== "-" ||
          display(x.correctedRFISC) !== "-" ||
          display(x.correctedEmdDesc) !== "-";

        const hasAI = (x) =>
          display(x.aiRFIC) !== "-" ||
          display(x.aiRFISC) !== "-" ||
          display(x.aiEmdDesc) !== "-";

        if (ll.includes("human")) {
          rows = rows.filter((x) => hasHuman(x));
        } else if (ll.includes("ai")) {
          // keep rows where AI suggested something but no human correction was applied
          rows = rows.filter((x) => hasAI(x) && !hasHuman(x));
        }
      }

      openDetailModal({
        title: `AI vs Human corrections${label ? ` — ${label}` : ""}`,
        subtitle: ``,
        rows,
      });
      return;
    }

    if (metricLabel === "End-to-end completion time") {
      const dayRow =
        e2eChart.find((d) => d.date === label) ||
        e2eChart.find((d) => d.key === label);
      const dayKey = dayRow?.key;

      rows = e2eListRows;
      if (dayKey) rows = rows.filter((x) => toDateKey(x.createdAt) === dayKey);

      openDetailModal({
        title: `End-to-end completion time${label ? ` — ${label}` : ""}`,
        subtitle: `${display(seriesName)} • ${display(value)}`,
        rows,
      });
      return;
    }

    if (metricLabel === "Assignments to ticketers") {
      rows = assignments.list.map(mapAssignmentItemToRow).filter(Boolean);
      if (label)
        rows = rows.filter((x) => normCmp(x.assigned) === normCmp(label));

      openDetailModal({
        title: `Assignments to ticketers${label ? ` — ${label}` : ""}`,
        subtitle: `${display(value)}`,
        rows,
      });
      return;
    }

    if (metricLabel === "Error visibility & classification") {
      rows = errorVis.list.map(mapErrorVisibilityItemToRow).filter(Boolean);
      if (label)
        rows = rows.filter((x) =>
          normCmp(x.errorClass).includes(normCmp(label)),
        );

      openDetailModal({
        title: `Error visibility & classification${label ? ` — ${label}` : ""}`,
        subtitle: `${display(value)}`,
        rows,
      });
      return;
    }

    if (metricLabel === "LLM metrics trend over time") {
      const dayRow =
        llmTrendChart.find((d) => d.date === label) ||
        llmTrendChart.find((d) => d.key === label);
      const dayKey = dayRow?.key;

      rows = llmTrend.list.map(mapLlmTrendListItemToRow).filter(Boolean);
      if (dayKey) rows = rows.filter((x) => toDateKey(x.createdAt) === dayKey);

      openDetailModal({
        title: `LLM metrics trend over time${label ? ` — ${label}` : ""}`,
        subtitle: ``,
        rows,
      });
      return;
    }

    if (metricLabel === "LLM metrics (avg in range)") {
      rows = llmAvg.list.map(mapLlmListItemToRow).filter(Boolean);
      openDetailModal({
        title: "LLM metrics (avg in range)",
        subtitle: "Rows contributing to LLM metrics in range",
        rows,
      });
      return;
    }

    openDetailModal({
      title: metricLabel || "Details",
      subtitle: `${display(value)}`,
      rows: [],
    });
  };

  // --------------------------------------------------
  // Cascading modal filters
  // --------------------------------------------------
  const norm = (v) =>
    String(v || "")
      .trim()
      .toLowerCase();

  const rowMatchesSearch = (r, q) => {
    if (!q) return true;

    const hay = [
      r.pnr,
      r.status,
      r.assigned,
      r.stage,
      r.createdAt,
      r.errorClass,
      r.airline,
      r.documentType,
      r.emdNumber,
    ]
      .map(safeStr)
      .join(" ")
      .toLowerCase();

    return hay.includes(q);
  };

  const rowMatchesFilters = (r, filters) => {
    if (
      filters.status !== "All" &&
      normalizeStatus(r.status) !== normalizeStatus(filters.status)
    ) {
      return false;
    }

    if (
      filters.assigned !== "All" &&
      norm(r.assigned) !== norm(filters.assigned)
    ) {
      return false;
    }

    if (filters.stage !== "All" && norm(r.stage) !== norm(filters.stage)) {
      return false;
    }

    if (
      filters.errorClass !== "All" &&
      norm(r.errorClass) !== norm(filters.errorClass)
    ) {
      return false;
    }

    return true;
  };

  const visibleDetailRows = useMemo(() => {
    const q = (detailSearch || "").trim().toLowerCase();

    return detailRows.filter((r) => {
      if (!rowMatchesSearch(r, q)) return false;
      return rowMatchesFilters(r, detailFilters);
    });
  }, [detailRows, detailSearch, detailFilters]);

  // Filter dropdown options now come only from currently visible rows.
  const detailOptions = useMemo(() => {
    const statuses = uniq(
      visibleDetailRows.map((r) => r.status).filter(Boolean),
    ).sort();

    const assigned = uniq(
      visibleDetailRows
        .map((r) => r.assigned)
        .filter((v) => Boolean(v) && v !== "-"),
    ).sort();

    const stages = uniq(
      visibleDetailRows.map((r) => r.stage).filter(Boolean),
    ).sort();

    const errorClasses = uniq(
      visibleDetailRows.map((r) => r.errorClass).filter(Boolean),
    ).sort();

    return {
      status: ["All", ...statuses],
      assigned: ["All", ...assigned],
      stage: ["All", ...stages],
      errorClass: ["All", ...errorClasses],
    };
  }, [visibleDetailRows]);

  const filteredDetailRows = useMemo(() => {
    const rows = [...visibleDetailRows];

    rows.sort((a, b) => {
      const av = a?.[detailSortKey];
      const bv = b?.[detailSortKey];

      const aNum = Number(av);
      const bNum = Number(bv);
      const bothNums = !Number.isNaN(aNum) && !Number.isNaN(bNum);

      let cmp = 0;

      if (bothNums) {
        cmp = aNum - bNum;
      } else {
        cmp = String(display(av)).localeCompare(String(display(bv)));
      }

      return detailSortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [visibleDetailRows, detailSortKey, detailSortDir]);

  useEffect(() => {
    // Reset paging when filters/search/sort change
    setDetailPage(1);
  }, [detailSearch, detailFilters, detailSortKey, detailSortDir]);

  const activeModalColumns = useMemo(
    () => getModalColumnDefs(detailTitle, openPnrDetails),
    [detailTitle],
  );

  const totalPages = useMemo(() => {
    const ps = Math.max(1, Number(detailPageSize) || 50);
    return Math.max(1, Math.ceil((filteredDetailRows.length || 0) / ps));
  }, [filteredDetailRows.length, detailPageSize]);

  const safeDetailPage = useMemo(() => {
    const p = Number(detailPage) || 1;
    return Math.min(Math.max(1, p), totalPages);
  }, [detailPage, totalPages]);

  const pagedDetailRows = useMemo(() => {
    const ps = Math.max(1, Number(detailPageSize) || 50);
    const start = (safeDetailPage - 1) * ps;
    return filteredDetailRows.slice(start, start + ps);
  }, [filteredDetailRows, safeDetailPage, detailPageSize]);

  const modalGridTemplate = useMemo(() => {
    const n = Math.max(1, activeModalColumns.length || 1);
    return Array.from({ length: n })
      .map(() => "minmax(140px, 1fr)")
      .join(" ");
  }, [activeModalColumns.length]);

  const virtualRange = useMemo(() => {
    const total = filteredDetailRows.length;
    if (total <= 0) return { start: 0, end: 0, total, top: 0, height: 0 };
    const rawStart = Math.floor((virtualScrollTop || 0) / VROW_H);
    const start = Math.max(0, rawStart - V_OVERSCAN);
    const visible = Math.ceil(VVIEW_H / VROW_H) + V_OVERSCAN * 2;
    const end = Math.min(total, start + visible);
    return { start, end, total, top: start * VROW_H, height: total * VROW_H };
  }, [filteredDetailRows.length, virtualScrollTop]);

  const toggleDetailSort = (key) => {
    if (detailSortKey !== key) {
      setDetailSortKey(key);
      setDetailSortDir("asc");
      return;
    }
    setDetailSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

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
          min={from}
          onChange={(e) => {
            setPreset(presets.CUSTOM);
            setTo(e.target.value);
          }}
          className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="button"
        onClick={() => loadTabData(subTab, { start_date: from, end_date: to })}
        className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-black/70 hover:text-black"
        title="Reload reports"
      >
        <i className="fa-solid fa-rotate mr-2" />
        Reload
      </button>
    </div>
  );

  const switchReportSubTab = (tab) => {
    appLogger.info("REPORTS_SUBTAB_CLICKED", {
      component: "Reports",
      tab,
    });

    setSubTab(tab);
  };

  const subTabNav = (
    <div className="flex flex-wrap items-center gap-2">
      <SubTabButton
        active={subTab === SUBTABS.OVERVIEW}
        onClick={() => switchReportSubTab(SUBTABS.OVERVIEW)}
        icon="fa-solid fa-gauge-high"
        label="Overview"
      />
      <SubTabButton
        active={subTab === SUBTABS.OPS}
        onClick={() => switchReportSubTab(SUBTABS.OPS)}
        icon="fa-solid fa-chart-line"
        label="Operations"
      />
      <SubTabButton
        active={subTab === SUBTABS.QUALITY}
        onClick={() => switchReportSubTab(SUBTABS.QUALITY)}
        icon="fa-solid fa-circle-check"
        label="Quality"
      />
      <SubTabButton
        active={subTab === SUBTABS.AI}
        onClick={() => switchReportSubTab(SUBTABS.AI)}
        icon="fa-solid fa-brain"
        label="AI Governance"
      />
      <SubTabButton
        active={subTab === SUBTABS.EXCEPTIONS}
        onClick={() => switchReportSubTab(SUBTABS.EXCEPTIONS)}
        icon="fa-solid fa-triangle-exclamation"
        label="Exceptions"
      />
    </div>
  );

  return (
    <div className="mt-2">
      {/* Top controls */}
      <div className="flex flex-col gap-3">
        {subTabNav}
        <div className="flex justify-between flex-wrap gap-3 items-center">
          {rangeControls}
        </div>
      </div>

      {/* Global hint */}
      {anyError ? (
        <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <div className="font-semibold">
            Some report widgets failed to load
          </div>
          <div className="mt-1">{anyError}</div>
        </div>
      ) : null}

      {/* KPI strip always visible */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Throughput"
          value={dashKpis.throughputCount}
          sub={
            dashLoading ? (
              "Loading dashboard summary…"
            ) : dashErr ? (
              <span className="text-red-700">{dashErr}</span>
            ) : (
              "PNRs created in range"
            )
          }
          icon={<i className="fa-solid fa-chart-line" />}
          onClick={openThroughputCardModal}
          loading={dashLoading}
        />

        <Card
          title="Avg Completion Time"
          value={`${dashKpis.avgMins} mins`}
          sub={
            dashLoading
              ? "Loading dashboard summary…"
              : `Records: ${dashKpis.avgItems.length}`
          }
          icon={<i className="fa-solid fa-stopwatch" />}
          tone={dashKpis.avgMins > 90 ? "warn" : "default"}
          onClick={openAvgCompletionCardModal}
          loading={dashLoading}
        />

        <Card
          title="Error Rate"
          value={pct(dashKpis.errorPct01)}
          sub={
            dashLoading
              ? "Loading dashboard summary…"
              : `${dashKpis.errorCount} errors • ${dashKpis.hilCount} HIL`
          }
          icon={<i className="fa-solid fa-triangle-exclamation" />}
          tone={dashKpis.errorPct01 > 0.2 ? "bad" : "default"}
          onClick={openErrorRateCardModal}
          loading={dashLoading}
        />

        <Card
          title="Exceptions"
          value={`${dashKpis.slaCount} SLA • ${dashKpis.admCount} ADM`}
          sub={
            dashLoading
              ? "Loading dashboard summary…"
              : `${dashKpis.withFeedbackCount} with feedback`
          }
          icon={<i className="fa-solid fa-shield-halved" />}
          tone={dashKpis.slaCount > 0 ? "warn" : "good"}
          onClick={openExceptionsCardModal}
          loading={dashLoading}
        />
      </div>

      {/* OVERVIEW */}
      {subTab === SUBTABS.OVERVIEW ? (
        <Section
          title="Overview"
          subtitle="A quick snapshot across operations, quality, and AI governance."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-black/10 bg-white p-3">
              <div className="mb-2 text-sm font-medium text-black">
                Throughput over time{" "}
                <span className="ml-2 text-xs text-black/40">(daily)</span>
              </div>
              <div className="h-56">
                {throughputOTLoading ? (
                  <div className="h-full flex items-center justify-center text-black/60">
                    <Spinner />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={throughputOverTimeChart}
                      onClick={(state) => {
                        const label = state?.activeLabel;
                        const ap = state?.activePayload || [];
                        const first = ap?.[0];
                        handleChartPick({
                          metricLabel: "Throughput over time",
                          label,
                          seriesName: first?.name,
                          value: first?.value,
                        });
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(0,0,0,0.06)"
                      />
                      <XAxis dataKey="date" />
                      <YAxis
                        allowDecimals={false}
                        label={{
                          value: "No. of PNRs",
                          angle: -90,
                          position: "insideLeft",
                          offset: 10,
                          style: { fontSize: 11, fill: "rgba(0,0,0,0.4)" },
                        }}
                      />
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
                )}
              </div>
              {throughputOTErr ? (
                <div className="mt-2 text-xs text-red-700">
                  {throughputOTErr}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-3">
              <div className="mb-2 text-sm font-medium text-black">
                AI vs Human corrections
              </div>
              <div className="h-56">
                {aiHumanLoading ? (
                  <div className="h-full flex items-center justify-center text-black/60">
                    <Spinner />
                  </div>
                ) : (
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
                        data={aiVsHumanChart}
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
                          });
                        }}
                      >
                        {aiVsHumanChart.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={idx === 0 ? COLORS.green : COLORS.orange}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {aiHumanErr ? (
                <div className="mt-2 text-xs text-red-700">{aiHumanErr}</div>
              ) : (
                <div className="mt-2 text-xs text-black/60">
                  Tracks drift & effect of model improvements.
                </div>
              )}
            </div>
          </div>
        </Section>
      ) : null}

      {/* OPERATIONS */}
      {subTab === SUBTABS.OPS ? (
        <Section
          title="Operational Reporting"
          subtitle="Throughput, assignments, completion time, and error visibility."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-black/10 bg-white p-3 lg:col-span-2">
              <div className="mb-2 text-sm font-medium text-black">
                End-to-end completion time{" "}
                <span className="ml-2 text-xs text-black/40">
                  (avg minutes/day)
                </span>
              </div>
              <div className="h-56">
                {e2eLoading ? (
                  <div className="h-full flex items-center justify-center text-black/60">
                    <Spinner />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={e2eChart}
                      onClick={(state) => {
                        const label = state?.activeLabel;
                        const ap = state?.activePayload || [];
                        const first = ap?.[0];
                        handleChartPick({
                          metricLabel: "End-to-end completion time",
                          label,
                          seriesName: first?.name,
                          value: first?.value,
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
                )}
              </div>
              {e2eErr ? (
                <div className="mt-2 text-xs text-red-700">{e2eErr}</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-3 lg:col-span-2">
              <div className="mb-2 text-sm font-medium text-black">
                Assignments to ticketers
              </div>

              <div className="h-56 overflow-x-hidden no-scrollbar overflow-y-auto">
                <div
                  style={{
                    height: `${Math.max(assignmentsChart.length * 20, 200)}px`,
                  }}
                >
                  {assignmentsLoading ? (
                    <div className="h-full flex items-center justify-center text-black/60">
                      <Spinner />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={assignmentsChart}
                        layout="vertical"
                        margin={{
                          top: 10,
                          right: 20,
                          bottom: 10,
                          left: 110,
                        }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(0,0,0,0.06)"
                        />
                        <XAxis type="number" allowDecimals={false} />

                        <YAxis
                          type="category"
                          dataKey="name"
                          width={90}
                          tick={{
                            fontSize: 12,
                          }}
                        />

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
                            });
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {assignmentsErr ? (
                  <div className="mt-2 text-xs text-red-700">
                    {assignmentsErr}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-3 lg:col-span-2">
              <div className="mb-2 text-sm font-medium text-black">
                Error visibility & classification
              </div>
              <div className="h-56">
                {errorVisLoading ? (
                  <div className="h-full flex items-center justify-center text-black/60">
                    <Spinner />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorClassChart}>
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
                          });
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              {errorVisErr ? (
                <div className="mt-2 text-xs text-red-700">{errorVisErr}</div>
              ) : null}
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
            <div className="rounded-xl border border-black/10 bg-white p-3">
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
                        subtitle: `Total: ${hilRows.length} in range`,
                        rows: hilRows,
                      })
                    }
                    disabled={hilLoading}
                  >
                    {hilLoading ? "…" : hilRows.length}
                  </button>
                </div>
              </div>

              {hilLoading ? (
                <div className="flex items-center gap-2 text-black/70">
                  <Spinner size="sm" /> Loading…
                </div>
              ) : (
                <SimpleTable
                  columns={[
                    {
                      key: "pnr",
                      header: "PNR",
                      render: (r) => (
                        <button
                          type="button"
                          className="text-brand-red hover:underline"
                          onClick={() => openPnrDetails(r)}
                        >
                          {display(r.pnr)}
                        </button>
                      ),
                    },
                    { key: "assigned", header: "Assigned" },
                    { key: "stage", header: "Stage" },
                    {
                      key: "createdAt",
                      header: "Queue Arrival",
                      render: (r) =>
                        r.createdAt
                          ? new Date(r.createdAt).toLocaleString(DATE_LOCALE, {
                              timeZone: DATE_TZ,
                            })
                          : "-",
                    },
                  ]}
                  rows={hilRows.slice(0, 10)}
                  emptyText="No HIL items in this range."
                />
              )}

              {hilErr ? (
                <div className="mt-2 text-xs text-red-700">{hilErr}</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-3">
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
                        subtitle: `Total: ${feedbackRows.length} in range`,
                        rows: feedbackRows,
                      })
                    }
                    disabled={pnrAdmLoading}
                  >
                    {pnrAdmLoading ? "…" : feedbackRows.length}
                  </button>
                </div>
              </div>

              {pnrAdmLoading ? (
                <div className="flex items-center gap-2 text-black/70">
                  <Spinner size="sm" /> Loading…
                </div>
              ) : (
                <SimpleTable
                  columns={[
                    {
                      key: "pnr",
                      header: "PNR",
                      render: (r) => (
                        <button
                          type="button"
                          className="text-brand-red hover:underline"
                          onClick={() => openPnrDetails(r)}
                        >
                          {display(r.pnr)}
                        </button>
                      ),
                    },
                    { key: "emdNumber", header: "EMD" },
                    { key: "assigned", header: "Assigned" },
                    {
                      key: "feedbackText",
                      header: "Feedback",
                      render: (r) => (
                        <span
                          title={display(r.feedbackText)}
                          className="block max-w-[220px] truncate"
                        >
                          {display(r.feedbackText)}
                        </span>
                      ),
                    },
                    {
                      key: "adm",
                      header: "ADM",
                      render: (r) => (r.adm ? "Yes" : "No"),
                    },
                  ]}
                  rows={feedbackRows.slice(0, 10)}
                  emptyText="No feedback items in this range."
                />
              )}

              {pnrAdmErr ? (
                <div className="mt-2 text-xs text-red-700">{pnrAdmErr}</div>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}

      {/* AI GOVERNANCE */}
      {subTab === SUBTABS.AI ? (
        <Section
          title="AI Governance Reporting"
          subtitle="AI vs human corrections + LLM metrics."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-black/10 bg-white p-3">
              <div className="mb-2 text-sm font-medium text-black">
                LLM metrics (avg in range)
              </div>
              <div className="h-56">
                {llmAvgLoading ? (
                  <div className="h-full flex items-center justify-center text-black/60">
                    <Spinner />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      data={llmRadar}
                      onClick={() =>
                        openDetailModal({
                          title: "LLM metrics (avg in range)",
                          subtitle: "Rows contributing to LLM metrics in range",
                          rows: llmAvg.list
                            .map(mapLlmListItemToRow)
                            .filter(Boolean),
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
                )}
              </div>
              {llmAvgErr ? (
                <div className="mt-2 text-xs text-red-700">{llmAvgErr}</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-3">
              <div className="mb-2 text-sm font-medium text-black">
                LLM metrics trend over time (daily avg)
              </div>
              <div className="h-56">
                {llmTrendLoading ? (
                  <div className="h-full flex items-center justify-center text-black/60">
                    <Spinner />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={llmTrendChart}
                      onClick={(state) => {
                        const label = state?.activeLabel;
                        const ap = state?.activePayload || [];
                        const first = ap?.[0];
                        handleChartPick({
                          metricLabel: "LLM metrics trend over time",
                          label,
                          seriesName: first?.name,
                          value: first?.value,
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
                        name="Accuracy"
                        stroke={COLORS.green}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="consistency"
                        name="Consistency"
                        stroke={COLORS.blue}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="groundedness"
                        name="Groundedness"
                        stroke={COLORS.purple}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="coherence"
                        name="Coherence"
                        stroke={COLORS.orange}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              {llmTrendErr ? (
                <div className="mt-2 text-xs text-red-700">{llmTrendErr}</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-3 lg:col-span-2">
              <div className="mb-2 text-sm font-medium text-black">
                AI RFIC/RFISC vs Human corrections
              </div>
              <div className="h-56">
                {aiHumanLoading ? (
                  <div className="h-full flex items-center justify-center text-black/60">
                    <Spinner />
                  </div>
                ) : (
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
                        data={aiVsHumanChart}
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
                          });
                        }}
                      >
                        {aiVsHumanChart.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={idx === 0 ? COLORS.green : COLORS.orange}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {aiHumanErr ? (
                <div className="mt-2 text-xs text-red-700">{aiHumanErr}</div>
              ) : null}
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
            <div className="rounded-xl border border-black/10 bg-white p-3">
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
                        subtitle: `Total: ${slaBreachedRows.length} in range`,
                        rows: slaBreachedRows,
                      })
                    }
                    disabled={e2eLoading}
                  >
                    {e2eLoading ? "…" : slaBreachedRows.length}
                  </button>
                </div>
              </div>

              {e2eLoading ? (
                <div className="flex items-center gap-2 text-black/70">
                  <Spinner size="sm" /> Loading…
                </div>
              ) : (
                <SimpleTable
                  columns={[
                    {
                      key: "pnr",
                      header: "PNR",
                      render: (r) => (
                        <button
                          type="button"
                          className="text-brand-red hover:underline"
                          onClick={() => openPnrDetails(r)}
                        >
                          {display(r.pnr)}
                        </button>
                      ),
                    },
                    { key: "assigned", header: "Assigned" },
                    {
                      key: "sla",
                      header: "SLA",
                      render: (r) => r.slaMinutes + "m",
                    },
                    {
                      key: "completion",
                      header: "Completion",
                      render: (r) => r.completionMinutes + "m",
                    },
                  ]}
                  rows={slaBreachedRows.slice(0, 10)}
                  emptyText="No SLA breaches in this range."
                />
              )}
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-3">
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
                        subtitle: `Total: ${admRows.length} in range`,
                        rows: admRows,
                      })
                    }
                    disabled={pnrAdmLoading}
                  >
                    {pnrAdmLoading ? "…" : admRows.length}
                  </button>
                </div>
              </div>

              {pnrAdmLoading ? (
                <div className="flex items-center gap-2 text-black/70">
                  <Spinner size="sm" /> Loading…
                </div>
              ) : (
                <SimpleTable
                  columns={[
                    {
                      key: "pnr",
                      header: "PNR",
                      render: (r) => (
                        <button
                          type="button"
                          className="text-brand-red hover:underline"
                          onClick={() => openPnrDetails(r)}
                        >
                          {display(r.pnr)}
                        </button>
                      ),
                    },
                    { key: "emdNumber", header: "EMD" },
                    { key: "assigned", header: "Assigned" },
                    {
                      key: "feedbackText",
                      header: "Feedback",
                      render: (r) => (
                        <span
                          title={display(r.feedbackText)}
                          className="block max-w-[220px] truncate"
                        >
                          {display(r.feedbackText)}
                        </span>
                      ),
                    },
                  ]}
                  rows={admRows.slice(0, 10)}
                  emptyText="No ADMs in this range."
                />
              )}
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <div className="lg:col-span-2 mt-5">
            <input
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
              placeholder="Search details…"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/40">
              Status
            </label>
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
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/40">
              Assigned To
            </label>
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
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/40">
              Stage
            </label>
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
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/40">
              Error Class
            </label>
            <select
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={detailFilters.errorClass}
              onChange={(e) =>
                setDetailFilters((p) => ({ ...p, errorClass: e.target.value }))
              }
            >
              {detailOptions.errorClass.map((opt) => (
                <option
                  className="ml-[-60px]"
                  key={`ec-${opt || "blank"}`}
                  value={opt}
                  title={opt}
                >
                  {opt?.length > 80 ? opt.substring(0, 80) + "..." : opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-sm border border-1 border-black/30 h-[320px]">
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
                // render ALL rows
                filteredDetailRows.map((r, idx) => (
                  <tr
                    key={`${r.pnr}-${idx}`}
                    className="border-b border-black/5 hover:bg-black/[0.02]"
                  >
                    {activeModalColumns.map((col) => (
                      <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                        {typeof col.render === "function"
                          ? col.render(r)
                          : display(r[col.key])}
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
            Total of{" "}
            <span className="font-semibold text-black">
              {filteredDetailRows.length}
            </span>{" "}
            {filteredDetailRows.length == 1 ? "entry" : "entries"} {""}
          </div>
        </div>
      </DetailModal>

      {/* PNR Details modal */}
      <PnrModal
        open={pnrModalOpen}
        selectedPnr={pnrModalPnr}
        selectedStatus={pnrModalStatus}
        onClose={() => setPnrModalOpen(false)}
        onOpenDashboard={onOpenPNR}
      />
    </div>
  );
}
