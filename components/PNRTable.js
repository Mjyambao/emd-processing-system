import { useMemo, useState, useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge";
import Tooltip from "./Tooltip";
import AssignModal from "./AssignModal";
import TTLModal from "./TTLModal";
import ToastViewport from "./ToastViewport";
import ThCheckboxHeader from "./ThCheckboxHeader";
import ThWithFilter from "./ThWithFilter";
import AssigneeMultiSelectFilter from "./AssigneeMultiSelectFilter";
import formatDate from "../utils/helper";

// API
import { getPnrQueueList, patchAssignPnr, patchTtlPnr } from "../api/pnrApi";

const FilterToggleButton = ({ open, active, onClick, label }) => (
  <button
    type="button"
    className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-black/60 hover:text-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red ${
      open ? "text-brand-red" : ""
    }`}
    aria-label={`Toggle ${label} filter`}
    aria-expanded={open ? "true" : "false"}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    title={`Show/hide ${label} filter`}
  >
    <span className="relative inline-flex">
      <i className="fa-solid fa-filter text-[11px]" />
      {active ? (
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-red ring-1 ring-white" />
      ) : null}
    </span>
  </button>
);

export default function PNRTable({
  // NOTE: rows prop is kept for compatibility, but table renders API rows (apiRows).
  rows,
  ticketType = "EMD",
  gdsRegion,
  search,
  setSearch,
  onRefresh,
  onSelect,
  selected,
  onKill,
  statusFilter = "all",
  isRefreshing = false,
  killingSet = new Set(),
  retryingSet = new Set(),
  assignees = [],
  onAssign,
  onUpdateTTL,
  //  callback to let Dashboard compute chip counts based on table rows (current page)
  onRowsChange,
  //  force assignTo for API query (used by "My Queues" tab to show only logged-in user)
  // If provided, it overrides Assigned To filter & includeUnassigned logic.
  assignedToOverride,
  loggedInUserName,
  loggedInUserId,
}) {
  /**
   * -----------------------------
   * Helpers
   * -----------------------------
   */
  const isNonEmdTicket = String(ticketType ?? "EMD") !== "EMD";
  const includesCI = (value, query) => {
    const v = String(value ?? "").toLowerCase();
    const q = String(query ?? "")
      .trim()
      .toLowerCase();
    if (!q) return true;
    return v.includes(q);
  };

  const isAssigned = (value) => {
    return (
      value &&
      value !== "" &&
      value !== "-" &&
      value !== null &&
      value !== undefined
    );
  };

  const isUnassigned = (value) => {
    return (
      !value ||
      value === "" ||
      value === "-" ||
      value === null ||
      value === undefined
    );
  };

  const isAssignmentOnlyFilter =
    statusFilter === "assigned" || statusFilter === "unassigned";

  const normalizeStatus = (raw) => {
    const s = String(raw ?? "")
      .trim()
      .toLowerCase();

    if (!s) return "";

    if (s === "error" || s === "error on processing" || s.includes("error")) {
      return "error";
    }

    if (
      s.includes("human") ||
      s.includes("input_required") ||
      s.includes("input required")
    ) {
      return "human";
    }

    if (
      s.includes("sent back to oasis") ||
      s.includes("sent_back_to_oasis") ||
      s.includes("sentbacktooasis")
    ) {
      return "sent_back_to_oasis";
    }

    if (s.includes("processing")) return "processing";
    if (s.includes("processed") || s.includes("completed")) return "processed";

    return s;
  };

  // UI normalized status -> API enum (based on sample: HUMAN_INPUT_REQUIRED, PROCESSED, etc.)
  const uiStatusToApiStatus = (s) => {
    switch (String(s ?? "").toLowerCase()) {
      case "error":
        return "ERROR";
      case "human":
        return "HUMAN_INPUT_REQUIRED";
      case "sent_back_to_oasis":
        return "SENT_BACK_TO_OASIS";
      case "processing":
        return "PROCESSING";
      case "processed":
        return "PROCESSED";
      default:
        return s || undefined;
    }
  };

  const getStatusLabel = (status) => {
    switch (String(status ?? "").toLowerCase()) {
      case "error":
        return "Error on Processing";
      case "human":
        return "Human Input Required";
      case "sent_back_to_oasis":
        return "Sent back to Oasis";
      case "processing":
        return "Processing";
      case "processed":
        return "Processed";
      default:
        return String(status ?? "") || "Unknown";
    }
  };

  const toIsoStartOfDayZ = (yyyyMmDd) => {
    if (!yyyyMmDd) return undefined;
    return new Date(`${yyyyMmDd}T00:00:00.000Z`).toISOString();
  };

  const toIsoEndOfDayZ = (yyyyMmDd) => {
    if (!yyyyMmDd) return undefined;
    return new Date(`${yyyyMmDd}T23:59:59.999Z`).toISOString();
  };

  // Safe date-only string for <input type="date" /> and display
  const toYYYYMMDD = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);

    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const getUtcStartOfDayMs = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;

    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };

  const compareDatesAsc = (a, b) => {
    const da = getUtcStartOfDayMs(a);
    const db = getUtcStartOfDayMs(b);

    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;

    return da - db;
  };

  const compareDatesDesc = (a, b) => {
    const da = getUtcStartOfDayMs(a);
    const db = getUtcStartOfDayMs(b);

    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;

    return db - da;
  };

  const getPriorityDateForRow = (row, ttlValueOverride) => {
    return ttlValueOverride || row?.ttl || row?.departureDate || null;
  };

  const getDaysFromToday = (value) => {
    const dateMs = getUtcStartOfDayMs(value);
    if (dateMs == null) return null;

    const now = new Date();
    const todayMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );

    return Math.floor((dateMs - todayMs) / 86400000);
  };

  const getUrgencyRowClass = (row, ttlValueOverride) => {
    const daysFromToday = getDaysFromToday(
      getPriorityDateForRow(row, ttlValueOverride),
    );

    if (daysFromToday == null) return "";

    // overdue
    if (daysFromToday < 0) {
      return "bg-red-50 hover:bg-red-100";
    }

    // 2 days and below
    if (daysFromToday <= 3) {
      return "bg-red-100 hover:bg-red-200";
    }

    return "";
  };

  // Convert TTL input (date-only or datetime-local) to UTC ISO string for the API
  const ttlInputToUtcIso = (value) => {
    const s = String(value ?? "").trim();
    if (!s) return undefined;

    // Date-only: treat as start-of-day in UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return new Date(`${s}T00:00:00.000Z`).toISOString();
    }

    // Datetime-local (no timezone): JS treats it as local time; convert to ISO UTC
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();

    // Fallback: if it looks like datetime without timezone, try forcing UTC
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      const dz = new Date(`${s}Z`);
      if (!Number.isNaN(dz.getTime())) return dz.toISOString();
    }

    return undefined;
  };

  /**
   * -----------------------------
   * Assign API (PATCH /api/v1/pnrs/{pnrId}/assign)
   * -----------------------------
   * Notes:
   * - assignmentReason defaults to "Assign to Ticketer"
   * - queueName defaults to "-"
   * - userId defaults to 0
   */
  const getAssignedById = () => "31";
  const getAssignedByName = () => loggedInUserName || "-";

  const makeCorrelationId = () => {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID)
        return crypto.randomUUID();
    } catch (_) {
      // ignore
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const mapSortKeyToSwaggerField = (key) => {
    switch (key) {
      case "pnr":
        return "pnrId";
      case "brand":
        return "brand";
      case "gds":
        return "gds";
      case "pcc":
        return "pcc";
      case "documentType":
        return "documentType";
      case "status":
        return "status";
      case "passengerNames":
        return "passengerNames";
      case "departureDate":
        return "departureDate";
      case "lastUpdated":
        return "lastUpdated";
      case "queueArrival":
        return "queueArrival";
      case "ttl":
        return "ttl";
      case "error":
        return "humanError";
      case "errorDetailed":
        return "errorDetails";
      case "assigned":
        return "assignTo";
      default:
        return "departureDate";
    }
  };

  const mapApiItemToRow = (item) => ({
    pnr: item?.pnrId ?? item?.pnr ?? "",
    brand: item?.brand ?? "",
    gds: item?.gds ?? "",
    pcc: item?.pcc ?? "",
    documentType: item?.documentType ?? "",
    status: normalizeStatus(item?.status),
    passengerNames: item?.passengerNames ?? "",
    departureDate: item?.departureDate ?? null,
    ttl: item?.ttlUtc ?? item?.ttl ?? null,
    stage: item?.stage ?? "",
    queueArrival: item?.queueArrival ?? null,
    lastUpdated: item?.lastUpdated ?? null,
    error: item?.humanError ?? "",
    errorDetailed: item?.errorDetails ?? "",
    assigned: item?.assignedTo ?? "",
    action: item?.actionRequired ?? "",

    // Extra fields kept for downstream actions (e.g., Assign API payload)
    correlationId: item?.correlationId ?? "",
    oasisQueueId: item?.oasisQueueId ?? item?.oasisQueueID ?? "",
    queueName: item?.queueName ?? item?.queue ?? "-",
  });

  const isSelectable = (row) =>
    row.status === "error" || row.status === "human";

  // Status priority: Error, Human, Sent back to Oasis, Processing, Processed
  const STATUS_RANK = useMemo(
    () => ({
      error: 0,
      human: 1,
      sent_back_to_oasis: 2,
      processing: 3,
      processed: 4,
    }),
    [],
  );

  /**
   * -----------------------------
   * Toasts
   * -----------------------------
   */
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const showToast = (message, { type = "success", duration = 4000 } = {}) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    if (duration > 0) {
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        duration,
      );
    }
  };

  const dismissToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  /**
   * -----------------------------
   * Column filters
   * -----------------------------
   */
  const [colFilters, setColFilters] = useState({
    pnr: "",
    brand: "",
    gds: "",
    pcc: "",
    documentType: "",
    status: "",
    passengerNames: "",
    departureDateFrom: "",
    departureDateTo: "",
    lastUpdatedFrom: "",
    lastUpdatedTo: "",
    queueFrom: "",
    queueTo: "",
    ttlFrom: "",
    ttlTo: "",
    error: "",
    assignedNames: [],
    includeUnassigned: false,
  });

  const updateFilter = (key, value) =>
    setColFilters((prev) => ({ ...prev, [key]: value }));

  const [filterOpen, setFilterOpen] = useState({
    pnr: false,
    brand: false,
    gds: false,
    pcc: false,
    documentType: false,
    status: false,
    passengerNames: false,
    departureDate: false,
    lastUpdated: false,
    queueArrival: false,
    ttl: false,
    error: false,
    assigned: false,
  });

  const toggleFilterUI = (key) =>
    setFilterOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const closeAllFilterUI = () =>
    setFilterOpen({
      pnr: false,
      brand: false,
      gds: false,
      pcc: false,
      documentType: false,
      status: false,
      passengerNames: false,
      departureDate: false,
      lastUpdated: false,
      queueArrival: false,
      ttl: false,
      error: false,
      assigned: false,
    });

  const isFilterActive = useMemo(
    () => ({
      pnr: !!colFilters.pnr?.trim(),
      brand: !!colFilters.brand?.trim(),
      gds: !!colFilters.gds?.trim(),
      pcc: !!colFilters.pcc?.trim(),
      documentType: !!colFilters.documentType?.trim(),
      status: !!colFilters.status,
      passengerNames: !!colFilters.passengerNames?.trim(),
      departureDate:
        !!colFilters.departureDateFrom || !!colFilters.departureDateTo,
      lastUpdated: !!colFilters.lastUpdatedFrom || !!colFilters.lastUpdatedTo,
      queueArrival: !!colFilters.queueFrom || !!colFilters.queueTo,
      ttl: !!colFilters.ttlFrom || !!colFilters.ttlTo,
      error: !!colFilters.error?.trim(),
      assigned:
        (Array.isArray(colFilters.assignedNames) &&
          colFilters.assignedNames.length > 0) ||
        !!colFilters.includeUnassigned,
    }),
    [colFilters],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") closeAllFilterUI();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * -----------------------------
   * Sorting (server + local tie-break)
   * -----------------------------
   * Default: TTL ASC, then Status priority and departure date desc
   */
  const [sort, setSort] = useState({ key: "ttl", dir: "asc" });

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: "ttl", dir: "asc" }; // revert to new default
    });
  };

  /**
   * -----------------------------
   * API state
   * -----------------------------
   */
  const [apiRows, setApiRows] = useState([]);
  const [apiMeta, setApiMeta] = useState({
    page: 1,
    pageSize: 10,
    totalRecords: 0,
    totalPages: 0,
  });
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const effectiveRows = apiRows;

  const filteredRows = useMemo(() => {
    let rowsToFilter = effectiveRows;

    // MY QUEUE FILTER
    if (assignedToOverride) {
      rowsToFilter = rowsToFilter.filter(
        (r) => r.assigned === assignedToOverride,
      );
    }

    // REFUND / REISSUE
    if (ticketType !== "EMD") {
      if (statusFilter === "assigned") {
        return rowsToFilter.filter((r) => isAssigned(r.assigned));
      }

      if (statusFilter === "unassigned") {
        return rowsToFilter.filter((r) => isUnassigned(r.assigned));
      }

      return rowsToFilter;
    }

    // EMD (existing)
    if (statusFilter !== "all") {
      rowsToFilter = rowsToFilter.filter((r) => r.status === statusFilter);
    }

    return rowsToFilter;
  }, [effectiveRows, statusFilter, ticketType, assignedToOverride]);

  const statusOptions = useMemo(() => {
    const defaults = [
      "error",
      "human",
      "sent_back_to_oasis",
      "processing",
      "processed",
    ];

    const set = new Set(
      [
        ...defaults,
        ...filteredRows.map((r) => r.status).filter(Boolean),
      ].filter(Boolean),
    );

    return Array.from(set);
  }, [filteredRows]);

  const assigneeOptions = assignees.length
    ? assignees
    : [
        {
          id: "1",
          name: "Ticketer 1",
          description: "(4 PNRs / 06:00 - 14:00)",
        },
        {
          id: "2",
          name: "Guest User",
          description: "(2 PNRs / 14:00 - 22:00)",
        },
        {
          id: "3",
          name: "Ticketer 2",
          description: "(0 PNRs / 22:00 - 06:00)",
        },
      ];

  const FILTER_ASSIGNEES = ["Ticketer 1", "Guest User", "Ticketer 2"];

  /**
   * --------
   *  Polling
   * --------
   */
  const POLL_INTERVAL_MS = 5_000; //miliseconds (5 seconds)

  // Latest snapshots for diffing
  const apiRowsRef = useRef([]);
  const apiMetaRef = useRef({
    page: 1,
    pageSize: 10,
    totalRecords: 0,
    totalPages: 0,
  });

  // Keep latest selected PNRs for pin-locking during polling
  const selectedPNRsRef = useRef(new Set());
  useEffect(() => {
    apiRowsRef.current = apiRows;
  }, [apiRows]);
  useEffect(() => {
    apiMetaRef.current = apiMeta;
  }, [apiMeta]);

  // Prevent overlap
  const inFlightRef = useRef(false);
  const requestSeqRef = useRef(0);

  const isSameMeta = (a, b) =>
    a?.page === b?.page &&
    a?.pageSize === b?.pageSize &&
    a?.totalRecords === b?.totalRecords &&
    a?.totalPages === b?.totalPages;

  const hasRowChanged = (prev, next) => {
    if (!prev) return true;
    return (
      prev.pnr !== next.pnr ||
      prev.brand !== next.brand ||
      prev.gds !== next.gds ||
      prev.pcc !== next.pcc ||
      prev.documentType !== next.documentType ||
      prev.status !== next.status ||
      prev.passengerNames !== next.passengerNames ||
      prev.departureDate !== next.departureDate ||
      prev.ttl !== next.ttl ||
      prev.stage !== next.stage ||
      prev.queueArrival !== next.queueArrival ||
      prev.lastUpdated !== next.lastUpdated ||
      prev.error !== next.error ||
      prev.assigned !== next.assigned ||
      prev.action !== next.action
    );
  };

  const mergeRowsPreserveIdentity = (prevRows, nextRows, opts = {}) => {
    const { lockPinned = false, pinnedSet } = opts || {};

    const prevMap = new Map(prevRows.map((r) => [r.pnr, r]));
    let changed = prevRows.length !== nextRows.length;

    // Preserve object identity for unchanged rows
    const mergedBase = nextRows.map((nr) => {
      const pr = prevMap.get(nr.pnr);
      if (pr && !hasRowChanged(pr, nr)) return pr; // keep identity
      changed = true;
      return nr;
    });

    // When polling, lock pinned rows (selected rows) to their previous indices.
    // This prevents selected rows from jumping around when new data arrives.
    if (!lockPinned || !pinnedSet || pinnedSet.size === 0) {
      return { merged: mergedBase, changed };
    }

    const nextMap = new Map(mergedBase.map((r) => [r.pnr, r]));

    // Determine pinned indices based on current rendered order (prevRows)
    const pinnedSlots = [];
    for (let i = 0; i < prevRows.length; i++) {
      const pnr = prevRows[i]?.pnr;
      if (!pnr) continue;
      if (!pinnedSet.has(pnr)) continue;
      const updated = nextMap.get(pnr);
      if (updated) pinnedSlots.push({ index: i, row: updated });
    }

    if (pinnedSlots.length === 0) {
      return { merged: mergedBase, changed };
    }

    // Unpinned list keeps the already-applied sorting (status + queueArrival etc.)
    const unpinned = mergedBase.filter((r) => !pinnedSet.has(r.pnr));

    const result = new Array(mergedBase.length).fill(null);

    // Place pinned rows at their original positions where possible
    for (const slot of pinnedSlots) {
      if (
        slot.index >= 0 &&
        slot.index < result.length &&
        result[slot.index] == null
      ) {
        result[slot.index] = slot.row;
      }
    }

    // Fill remaining slots with sorted unpinned rows
    let u = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] != null) continue;
      result[i] = unpinned[u++] ?? null;
    }

    // If something went off (shouldn't), fall back to mergedBase
    const merged = result.every((x) => x != null) ? result : mergedBase;

    return { merged, changed: true };
  };

  const buildQueryParams = () => {
    const f = colFilters;

    const apiStatusFilter =
      statusFilter === "assigned" || statusFilter === "unassigned"
        ? "all"
        : statusFilter;

    const status =
      apiStatusFilter === "all"
        ? undefined
        : uiStatusToApiStatus(apiStatusFilter);

    // assignTo base logic (existing behavior), unless assignedToOverride is provided.
    let assignTo;
    if (assignedToOverride && String(assignedToOverride).trim()) {
      assignTo = String(assignedToOverride).trim();
    } else if (Array.isArray(f.assignedNames) && f.assignedNames.length === 1) {
      assignTo = f.assignedNames[0];
    } else if (
      f.includeUnassigned &&
      (!f.assignedNames || f.assignedNames.length === 0)
    ) {
      assignTo = "Unassigned";
    } else {
      assignTo = undefined;
    }

    const pnr = f.pnr?.trim()
      ? f.pnr.trim()
      : search?.trim()
        ? search.trim()
        : undefined;

    const errorDetails = f.error?.trim() ? f.error.trim() : undefined;

    const lastUpdatedFrom = f.lastUpdatedFrom
      ? toIsoStartOfDayZ(f.lastUpdatedFrom)
      : undefined;
    const lastUpdatedTo = f.lastUpdatedTo
      ? toIsoEndOfDayZ(f.lastUpdatedTo)
      : undefined;

    const queueArrivalFrom = f.queueFrom
      ? toIsoStartOfDayZ(f.queueFrom)
      : undefined;
    const queueArrivalTo = f.queueTo ? toIsoEndOfDayZ(f.queueTo) : undefined;

    const ttlFrom = f.ttlFrom ? toIsoStartOfDayZ(f.ttlFrom) : undefined;
    const ttlTo = f.ttlTo ? toIsoEndOfDayZ(f.ttlTo) : undefined;

    // Text filters
    const brand = f.brand?.trim() ? f.brand.trim() : undefined;
    const gds = f.gds?.trim() ? f.gds.trim() : undefined;
    const pcc = f.pcc?.trim() ? f.pcc.trim() : undefined;
    const documentType = f.documentType?.trim()
      ? f.documentType.trim()
      : undefined;
    const passengerNames = f.passengerNames?.trim()
      ? f.passengerNames.trim()
      : undefined;

    // Date range filter
    const departureDateFrom = f.departureDateFrom
      ? toIsoStartOfDayZ(f.departureDateFrom)
      : undefined;
    const departureDateTo = f.departureDateTo
      ? toIsoEndOfDayZ(f.departureDateTo)
      : undefined;

    // Sort: "field:dir"
    const sortField = mapSortKeyToSwaggerField(sort?.key || "departureDate");
    const sortDir = sort?.dir || "desc";
    const sortParam = `${sortField}:${sortDir}`;

    return {
      page: Math.max(1, page), // backend expects 1-based
      pageSize: Math.min(100, Math.max(1, pageSize)),
      status,
      assignTo,
      pnr,
      brand,
      gds,
      pcc,
      documentType,
      passengerNames,
      departureDateFrom,
      departureDateTo,
      errorDetails,
      lastUpdatedFrom,
      lastUpdatedTo,
      queueArrivalFrom,
      queueArrivalTo,
      ttlFrom,
      ttlTo,
      sort: sortParam,
    };
  };

  const applyLocalSecondarySort = (rowsToSort) => {
    // Final order:
    // 1) TTL date asc (rows with TTL come first and earlier TTLs are prioritized)
    // 2) Status priority:
    //    Error on Processing -> Human Input Required -> Sent back to Oasis -> Processing -> Processed
    // 3) Departure Date asc
    // 4) Queue Arrival desc
    // 5) PNR
    return [...rowsToSort].sort((a, b) => {
      const aHasTtl = getUtcStartOfDayMs(a.ttl) != null;
      const bHasTtl = getUtcStartOfDayMs(b.ttl) != null;

      // Rows with TTL should sort before rows without TTL
      if (aHasTtl !== bHasTtl) {
        return aHasTtl ? -1 : 1;
      }

      // If both rows have TTL, sort by TTL first
      if (aHasTtl && bHasTtl) {
        const ttlCompare = compareDatesAsc(a.ttl, b.ttl);
        if (ttlCompare !== 0) return ttlCompare;
      }

      // Then status priority
      const ra = STATUS_RANK[a.status] ?? 99;
      const rb = STATUS_RANK[b.status] ?? 99;
      if (ra !== rb) return ra - rb;

      // Then departure date
      const departureCompare = compareDatesAsc(
        a.departureDate,
        b.departureDate,
      );
      if (departureCompare !== 0) return departureCompare;

      // Preserve previous queue behavior only as an extra tie-breaker
      const qa = a.queueArrival
        ? new Date(a.queueArrival).getTime()
        : -Infinity;
      const qb = b.queueArrival
        ? new Date(b.queueArrival).getTime()
        : -Infinity;
      if (qa !== qb) return qb - qa;

      return String(a.pnr ?? "").localeCompare(String(b.pnr ?? ""));
    });
  };

  const fetchPnrList = async ({ silent = false, reason = "manual" } = {}) => {
    // Avoid overlapping calls
    if (inFlightRef.current) return;

    const seq = ++requestSeqRef.current;
    inFlightRef.current = true;

    if (!silent) {
      setApiLoading(true);
      setApiError("");
    }

    try {
      const query = buildQueryParams();
      const res = await getPnrQueueList(query);
      const data = res?.data ?? res;

      // Safety: ignore out-of-order responses
      if (seq !== requestSeqRef.current) {
        inFlightRef.current = false;
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      let mapped = items.map(mapApiItemToRow);

      // Existing multi-assignee client-side logic (kept)
      if (
        Array.isArray(colFilters.assignedNames) &&
        colFilters.assignedNames.length > 1
      ) {
        mapped = mapped.filter((r) =>
          colFilters.assignedNames.some((name) => includesCI(r.assigned, name)),
        );
      }

      if (
        colFilters.includeUnassigned &&
        Array.isArray(colFilters.assignedNames)
      ) {
        mapped = mapped.filter((r) => {
          const assignedStr = String(r.assigned ?? "").trim();
          const normalized = assignedStr.toLowerCase();
          const isUnassigned =
            assignedStr.length === 0 ||
            normalized === "unassigned" ||
            assignedStr === "-";
          if (isUnassigned) return true;
          if (colFilters.assignedNames.length === 0) return true;
          return colFilters.assignedNames.some((name) =>
            includesCI(assignedStr, name),
          );
        });
      }

      mapped = applyLocalSecondarySort(mapped);

      const nextMeta = {
        page: typeof data?.page === "number" ? data.page : query.page,
        pageSize:
          typeof data?.pageSize === "number" ? data.pageSize : query.pageSize,
        totalRecords:
          typeof data?.totalRecords === "number" ? data.totalRecords : 0,
        totalPages: typeof data?.totalPages === "number" ? data.totalPages : 0,
      };

      //  Diff rows/meta BEFORE updating state
      const prevRows = apiRowsRef.current;
      const prevMeta = apiMetaRef.current;

      const { merged, changed: rowsChanged } = mergeRowsPreserveIdentity(
        prevRows,
        mapped,
      );
      const metaChanged = !isSameMeta(prevMeta, nextMeta);

      //  Only update state if necessary
      if (rowsChanged) setApiRows(merged);
      if (metaChanged) setApiMeta(nextMeta);

      // Always clear error on success (even for silent polling)
      setApiError("");

      // Keep local pageSize in sync if backend returns different value
      if (typeof data?.pageSize === "number" && data.pageSize !== pageSize) {
        setPageSize(data.pageSize);
      }

      // Clamp page if totalPages shrank (important for polling updates)
      const safeTotalPages = Math.max(1, nextMeta.totalPages || 1);
      if (page > safeTotalPages) {
        setPage(safeTotalPages);
      } else if (typeof data?.page === "number" && data.page !== page) {
        setPage(data.page);
      }

      //  Notify parent only if something changed (prevents chip-count churn)
      if (rowsChanged || metaChanged) {
        try {
          onRowsChange?.({
            rows: rowsChanged ? merged : prevRows,
            meta: nextMeta,
          });
        } catch {
          // no-op
        }
      }
    } catch (e) {
      console.error("Fetch PNR list failed:", e);

      // For polling: don't wipe table contents; just set error text
      setApiError(e?.message || "Failed to load PNR list.");

      if (!silent) {
        // Original behavior for non-silent fetches
        setApiRows([]);
        setApiMeta((m) => ({ ...m, totalRecords: 0, totalPages: 0 }));

        try {
          onRowsChange?.({
            rows: [],
            meta: { page, pageSize, totalRecords: 0, totalPages: 0 },
          });
        } catch {
          // no-op
        }
      }
    } finally {
      inFlightRef.current = false;
      if (!silent) setApiLoading(false);
    }
  };

  // Reset to page 1 when filters/sort/search/pageSize change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, colFilters, sort, pageSize, assignedToOverride]);

  // Debounced fetch on relevant changes (normal fetch - not silent)
  useEffect(() => {
    // Do NOT call API when using Assigned/Unassigned chips.
    // Those chips are UI-only filters on already-fetched apiRows.
    if (statusFilter === "assigned" || statusFilter === "unassigned") {
      return;
    }

    const t = setTimeout(() => {
      fetchPnrList({ silent: false, reason: "params-change" });
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageSize,
    sort,
    statusFilter,
    search,
    colFilters,
    assignedToOverride,
  ]);

  //  Poll for updates every 30 seconds
  const fetchRef = useRef(fetchPnrList);
  useEffect(() => {
    fetchRef.current = fetchPnrList;
  });

  useEffect(() => {
    if (!POLL_INTERVAL_MS || POLL_INTERVAL_MS <= 0) return;

    const id = setInterval(() => {
      // Skip polling when tab not visible
      if (typeof document !== "undefined" && document.hidden) return;
      if (statusFilter === "assigned" || statusFilter === "unassigned") return;
      fetchRef.current?.({ silent: true, reason: "poll" });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  const totalRecordsRaw = apiMeta.totalRecords;
  const totalPages = Math.max(1, apiMeta.totalPages || 1);
  const clampedPage = Math.min(page, totalPages);

  const pageRows = filteredRows;
  // If polling adds rows but the backend meta lags, ensure the footer still reflects the latest count.
  const displayedMax = (clampedPage - 1) * pageSize + (pageRows?.length || 0);
  const totalRecords = Math.max(totalRecordsRaw || 0, displayedMax);

  const from = pageRows.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const to =
    pageRows.length === 0 ? 0 : (clampedPage - 1) * pageSize + pageRows.length;

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    let startPage = Math.max(1, clampedPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    startPage = Math.max(1, endPage - maxButtons + 1);
    return Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i,
    );
  }, [clampedPage, totalPages]);

  const pnrToOriginalIndex = useMemo(() => {
    const map = new Map();
    const offset = (clampedPage - 1) * pageSize;
    pageRows.forEach((r, idx) => map.set(r.pnr, offset + idx));
    return map;
  }, [pageRows, clampedPage, pageSize]);

  /**
   * -----------------------------
   * TTL local
   * -----------------------------
   */
  const [ttlLocalMap, setTtlLocalMap] = useState(() => new Map());

  useEffect(() => {
    setTtlLocalMap((prev) => {
      const next = new Map();
      const has = new Set(pageRows.map((r) => r.pnr));
      for (const [pnr, val] of prev) {
        if (has.has(pnr)) next.set(pnr, val);
      }
      return next;
    });
  }, [pageRows]);

  const getTTLForRow = (row) => ttlLocalMap.get(row.pnr) || row.ttl || null;

  const [ttlModal, setTtlModal] = useState({
    open: false,
    pnr: null,
    originalIndex: null,
    dateStr: "",
    saving: false,
  });

  const openTTLModalForRow = (row) => {
    const pnr = row.pnr;
    const originalIndex = pnrToOriginalIndex.get(pnr);
    const current = getTTLForRow(row);
    setTtlModal({
      open: true,
      pnr,
      originalIndex,
      dateStr: toYYYYMMDD(current),
      saving: false,
    });
  };

  const closeTTLModal = () =>
    setTtlModal((m) => ({ ...m, open: false, saving: false }));

  /**
   * -----------------------------
   * Selection
   * -----------------------------
   */
  const [selectedPNRs, setSelectedPNRs] = useState(() => new Set());

  useEffect(() => {
    selectedPNRsRef.current = selectedPNRs;
  }, [selectedPNRs]);

  useEffect(() => {
    setSelectedPNRs((prev) => {
      const next = new Set();
      const rowByPnr = new Map(pageRows.map((r) => [r.pnr, r]));
      for (const pnr of prev) {
        const row = rowByPnr.get(pnr);
        if (row && isSelectable(row)) next.add(pnr);
      }
      return next;
    });
  }, [pageRows]);

  const selectedCount = selectedPNRs.size;
  const pageSelectablePNRs = pageRows.filter(isSelectable).map((r) => r.pnr);
  const pageSelectableCount = pageSelectablePNRs.length;

  const pageSelectedCount = pageSelectablePNRs.reduce(
    (cnt, pnr) => cnt + (selectedPNRs.has(pnr) ? 1 : 0),
    0,
  );

  const pageAllSelected =
    pageSelectableCount > 0 && pageSelectedCount === pageSelectableCount;
  const pageSomeSelected = pageSelectedCount > 0 && !pageAllSelected;

  const headerCbRef = useRef(null);

  useEffect(() => {
    if (headerCbRef.current)
      headerCbRef.current.indeterminate = pageSomeSelected;
  }, [pageSomeSelected]);

  const toggleRow = (row) => {
    if (!isSelectable(row)) return;
    const pnr = row.pnr;
    setSelectedPNRs((prev) => {
      const next = new Set(prev);
      if (next.has(pnr)) next.delete(pnr);
      else next.add(pnr);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    if (pageSelectableCount === 0) return;
    setSelectedPNRs((prev) => {
      const next = new Set(prev);
      if (pageAllSelected)
        pageSelectablePNRs.forEach((pnr) => next.delete(pnr));
      else pageSelectablePNRs.forEach((pnr) => next.add(pnr));
      return next;
    });
  };

  const clearSelection = () => setSelectedPNRs(new Set());

  /**
   * -----------------------------
   * Assign modal
   * -----------------------------
   */
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const assignPnrsToAssignee = async (assignee, items) => {
    // Items: [{ pnr, originalIndex }]
    const assignTo = assignee?.name ?? String(assignee?.id ?? "");
    const assignedById = getAssignedById();
    const assignedByName = getAssignedByName();

    const failures = [];

    // Limit concurrency to avoid flooding API
    const CONCURRENCY = 5;
    const queue = [...items];

    const runOne = async (it) => {
      const pnrId = it.pnr;
      const row = apiRowsRef.current?.find?.((r) => r.pnr === pnrId);

      const payload = {
        assignTo,
      };

      await patchAssignPnr(pnrId, payload);

      // Apply local UI update for that PNR immediately
      setApiRows((prev) =>
        prev.map((r) => (r.pnr === pnrId ? { ...r, assigned: assignTo } : r)),
      );
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      () =>
        (async () => {
          while (queue.length) {
            const it = queue.shift();
            if (!it) break;
            try {
              await runOne(it);
            } catch (e) {
              failures.push({ pnr: it.pnr, error: e });
            }
          }
        })(),
    );

    await Promise.all(workers);

    // Optional notification hook for parent (kept for compatibility)
    try {
      await Promise.resolve(
        onAssign?.({ assignee, items, assignTo, assignedByName, failures }),
      );
    } catch (_) {
      // ignore parent callback errors to avoid masking API results
    }

    if (failures.length) {
      const list = failures
        .slice(0, 3)
        .map((f) => f.pnr)
        .join(", ");
      const more = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
      throw new Error(
        `Failed to assign ${failures.length} PNR(s): ${list}${more}`,
      );
    }
  };

  const openAssign = () => setAssignOpen(true);

  const closeAssign = () => {
    if (!assigning) setAssignOpen(false);
  };

  const pageSelectableEligibleCount = useMemo(
    () => pageRows.filter(isSelectable).length,
    [pageRows],
  );

  return (
    <div className="card mb-6 relative pnr-table compact">
      {/* Toasts */}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="p-2 border-b border-black/10 flex flex-col md:flex-row md:items-center justify-between gap-1">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            className="btn btn-primary h-9 px-3 text-xs justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            title={
              selectedCount > 0
                ? "Assign selected PNRs"
                : "Select eligible rows to enable"
            }
            onClick={openAssign}
            disabled={selectedCount === 0 || assigning}
          >
            <i className="fa-regular fa-paper-plane" />
            <span className="ml-1.5">
              {assigning ? "Assigning..." : "Assign PNR"}
            </span>
          </button>

          {statusFilter === "assigned" && (
            <button
              type="button"
              className="btn btn-secondary h-9 px-3 text-xs justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              title={
                selectedCount > 0
                  ? "Send selected PNRs to Oasis"
                  : "Select eligible rows to enable"
              }
              onClick={() => alert("Sending PNRs to Oasis")}
              disabled={selectedCount === 0 || assigning}
            >
              <i className="fa-regular fa-paper-plane" />
              <span className="ml-1.5">
                {assigning ? "Sending..." : "Send to Oasis"}
              </span>
            </button>
          )}

          <div className="text-xs text-black/70">{selectedCount} selected</div>

          <div className="ml-2 text-xs text-black/50">
            {apiLoading ? "Loading..." : apiError ? "Failed to load" : ""}
          </div>
        </div>
      </div>

      {/* Helper banner */}
      {totalRecords > 0 && pageSelectableEligibleCount === 0 && (
        <div className="mx-2 my-1.5 px-2 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs">
          No selectable rows in current results. Only <b>Error</b> or{" "}
          <b>Human</b> statuses are eligible for assignment.
        </div>
      )}

      {/* API Error banner */}
      {apiError && (
        <div className="mx-2 my-1.5 px-2 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs">
          {apiError}
        </div>
      )}

      <div
        className="relative overflow-x-auto overflow-y-auto scroll-smooth max-h-[340px] pb-2"
        tabIndex={0}
        role="region"
        aria-label="PNR results table"
      >
        <table className="table min-w-[2400px] bg-white text-xs leading-tight">
          <thead className="sticky top-0 z-[30] bg-white [&>tr>th]:px-2 [&>tr>th]:py-1.5">
            <tr className="bg-white">
              <ThCheckboxHeader
                headerCbRef={headerCbRef}
                pageAllSelected={pageAllSelected}
                pageSelectableCount={pageSelectableCount}
                toggleSelectAllPage={toggleSelectAllPage}
              />

              {/* PNR */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    PNR
                    <FilterToggleButton
                      open={filterOpen.pnr}
                      active={isFilterActive.pnr}
                      onClick={() => toggleFilterUI("pnr")}
                      label="PNR"
                    />
                  </span>
                }
                widthClass="w-[140px]"
                sortKey="pnr"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.pnr && (
                  <div className="mt-1">
                    <input
                      className="input h-7 text-xs w-full"
                      placeholder="Filter PNR…"
                      value={colFilters.pnr}
                      onChange={(e) => updateFilter("pnr", e.target.value)}
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Brand */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    Brand
                    <FilterToggleButton
                      open={filterOpen.brand}
                      active={isFilterActive.brand}
                      onClick={() => toggleFilterUI("brand")}
                      label="Brand"
                    />
                  </span>
                }
                widthClass="w-[180px]"
                sortKey="brand"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.brand && (
                  <div className="mt-1">
                    <input
                      className="input h-7 text-xs w-full"
                      placeholder="Filter brand…"
                      value={colFilters.brand}
                      onChange={(e) => updateFilter("brand", e.target.value)}
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* GDS */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    GDS
                    <FilterToggleButton
                      open={filterOpen.gds}
                      active={isFilterActive.gds}
                      onClick={() => toggleFilterUI("gds")}
                      label="GDS"
                    />
                  </span>
                }
                widthClass="w-[120px]"
                sortKey="gds"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.gds && (
                  <div className="mt-1">
                    <input
                      className="input h-7 text-xs w-full"
                      placeholder="Filter GDS…"
                      value={colFilters.gds}
                      onChange={(e) => updateFilter("gds", e.target.value)}
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Store PCC */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    Store PCC
                    <FilterToggleButton
                      open={filterOpen.pcc}
                      active={isFilterActive.pcc}
                      onClick={() => toggleFilterUI("pcc")}
                      label="Store PCC"
                    />
                  </span>
                }
                widthClass="w-[130px]"
                sortKey="pcc"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.pcc && (
                  <div className="mt-1">
                    <input
                      className="input h-7 text-xs w-full"
                      placeholder="Filter PCC…"
                      value={colFilters.pcc}
                      onChange={(e) => updateFilter("pcc", e.target.value)}
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Document Type */}
              {!isNonEmdTicket && (
                <ThWithFilter
                  label={
                    <span className="inline-flex items-center gap-1">
                      Document Type
                      <FilterToggleButton
                        open={filterOpen.documentType}
                        active={isFilterActive.documentType}
                        onClick={() => toggleFilterUI("documentType")}
                        label="Document Type"
                      />
                    </span>
                  }
                  widthClass="w-[150px]"
                  sortKey="documentType"
                  sort={sort}
                  onSort={toggleSort}
                >
                  {filterOpen.documentType && (
                    <div className="mt-1">
                      <input
                        className="input h-7 text-xs w-full"
                        placeholder="Filter document type…"
                        value={colFilters.documentType}
                        onChange={(e) =>
                          updateFilter("documentType", e.target.value)
                        }
                      />
                    </div>
                  )}
                </ThWithFilter>
              )}

              {/* Status */}
              {!isNonEmdTicket && (
                <ThWithFilter
                  label={
                    <span className="inline-flex items-center gap-1">
                      Status
                      <FilterToggleButton
                        open={filterOpen.status}
                        active={isFilterActive.status}
                        onClick={() => toggleFilterUI("status")}
                        label="Status"
                      />
                    </span>
                  }
                  widthClass="w-[130px]"
                  sortKey="status"
                  sort={sort}
                  onSort={toggleSort}
                >
                  {filterOpen.status && (
                    <div className="mt-1">
                      <select
                        className="input h-7 text-xs w-full"
                        value={colFilters.status}
                        onChange={(e) => updateFilter("status", e.target.value)}
                      >
                        <option value="">All</option>

                        {statusOptions.map((s) => (
                          <option key={s} value={s}>
                            {getStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </ThWithFilter>
              )}

              {/* Passenger Names */}
              {!isNonEmdTicket && (
                <ThWithFilter
                  label={
                    <span className="inline-flex items-center gap-1">
                      Passenger Names
                      <FilterToggleButton
                        open={filterOpen.passengerNames}
                        active={isFilterActive.passengerNames}
                        onClick={() => toggleFilterUI("passengerNames")}
                        label="Passenger Names"
                      />
                    </span>
                  }
                  widthClass="w-[260px]"
                  sortKey="passengerNames"
                  sort={sort}
                  onSort={toggleSort}
                >
                  {filterOpen.passengerNames && (
                    <div className="mt-1">
                      <input
                        className="input h-7 text-xs w-full"
                        placeholder="Filter passenger…"
                        value={colFilters.passengerNames}
                        onChange={(e) =>
                          updateFilter("passengerNames", e.target.value)
                        }
                      />
                    </div>
                  )}
                </ThWithFilter>
              )}

              {/* Departure Date */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    Departure Date
                    <FilterToggleButton
                      open={filterOpen.departureDate}
                      active={isFilterActive.departureDate}
                      onClick={() => toggleFilterUI("departureDate")}
                      label="Departure Date"
                    />
                  </span>
                }
                widthClass="w-[170px]"
                nowrap
                sortKey="departureDate"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.departureDate && (
                  <div className="mt-1 flex gap-0.5">
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.departureDateFrom}
                      onChange={(e) =>
                        updateFilter("departureDateFrom", e.target.value)
                      }
                      aria-label="Departure date from"
                    />
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.departureDateTo}
                      onChange={(e) =>
                        updateFilter("departureDateTo", e.target.value)
                      }
                      aria-label="Departure date to"
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Last Updated */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    Last Updated
                    <FilterToggleButton
                      open={filterOpen.lastUpdated}
                      active={isFilterActive.lastUpdated}
                      onClick={() => toggleFilterUI("lastUpdated")}
                      label="Last Updated"
                    />
                  </span>
                }
                widthClass="w-[190px]"
                nowrap
                sortKey="lastUpdated"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.lastUpdated && (
                  <div className="mt-1 flex gap-0.5">
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.lastUpdatedFrom}
                      onChange={(e) =>
                        updateFilter("lastUpdatedFrom", e.target.value)
                      }
                      aria-label="Last updated from"
                    />
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.lastUpdatedTo}
                      onChange={(e) =>
                        updateFilter("lastUpdatedTo", e.target.value)
                      }
                      aria-label="Last updated to"
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Queue Arrival */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    Queue Arrival
                    <FilterToggleButton
                      open={filterOpen.queueArrival}
                      active={isFilterActive.queueArrival}
                      onClick={() => toggleFilterUI("queueArrival")}
                      label="Queue Arrival"
                    />
                  </span>
                }
                widthClass="w-[190px]"
                nowrap
                sortKey="queueArrival"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.queueArrival && (
                  <div className="mt-1 flex gap-0.5">
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.queueFrom}
                      onChange={(e) =>
                        updateFilter("queueFrom", e.target.value)
                      }
                      aria-label="Queue arrival from"
                    />
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.queueTo}
                      onChange={(e) => updateFilter("queueTo", e.target.value)}
                      aria-label="Queue arrival to"
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* TTL */}

              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    TTL
                    <FilterToggleButton
                      open={filterOpen.ttl}
                      active={isFilterActive.ttl}
                      onClick={() => toggleFilterUI("ttl")}
                      label="TTL"
                    />
                  </span>
                }
                widthClass="w-[180px]"
                nowrap
                sortKey="ttl"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.ttl && (
                  <div className="mt-1 flex gap-0.5">
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.ttlFrom}
                      onChange={(e) => updateFilter("ttlFrom", e.target.value)}
                      aria-label="TTL from"
                    />
                    <input
                      type="date"
                      className="input h-8 text-xs"
                      value={colFilters.ttlTo}
                      onChange={(e) => updateFilter("ttlTo", e.target.value)}
                      aria-label="TTL to"
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Error Details */}
              {!isNonEmdTicket && (
                <ThWithFilter
                  label={
                    <span className="inline-flex items-center gap-1">
                      Error Details
                      <FilterToggleButton
                        open={filterOpen.error}
                        active={isFilterActive.error}
                        onClick={() => toggleFilterUI("error")}
                        label="Error Details"
                      />
                    </span>
                  }
                  widthClass="w-[420px]"
                  sortKey="error"
                  sort={sort}
                  onSort={toggleSort}
                >
                  {filterOpen.error && (
                    <div className="mt-1">
                      <input
                        className="input h-7 text-xs w-full"
                        placeholder="Filter error…"
                        value={colFilters.error}
                        onChange={(e) => updateFilter("error", e.target.value)}
                      />
                    </div>
                  )}
                </ThWithFilter>
              )}

              {/* Assigned To */}
              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    Assigned To
                    <FilterToggleButton
                      open={filterOpen.assigned}
                      active={isFilterActive.assigned}
                      onClick={() => toggleFilterUI("assigned")}
                      label="Assigned To"
                    />
                  </span>
                }
                widthClass="w-[240px]"
                sortKey="assigned"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.assigned && (
                  <div className="mt-1">
                    <AssigneeMultiSelectFilter
                      options={FILTER_ASSIGNEES}
                      selected={colFilters.assignedNames}
                      includeUnassigned={colFilters.includeUnassigned}
                      onCommit={({ selected, includeUnassigned }) => {
                        updateFilter("assignedNames", selected);
                        updateFilter("includeUnassigned", includeUnassigned);
                      }}
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Action Required (filter removed) */}
              {/* <th className="w-[220px] whitespace-nowrap">
                <div className="px-3 py-2 font-semibold text-xs text-black/70">
                  Action Required
                </div>
              </th> */}

              {isNonEmdTicket && (
                <th className="w-[220px] whitespace-nowrap">
                  <div className="px-3 py-2 font-semibold text-sm text-black text-center"></div>
                </th>
              )}
            </tr>
          </thead>

          <tbody className="relative z-[10] [&>tr>td]:px-2 [&>tr>td]:py-1.5 [&>tr>td]:align-middle">
            {pageRows.map((row) => {
              const selectable = isSelectable(row);
              const isChecked = selectable && selectedPNRs.has(row.pnr);
              const ttlForRow = getTTLForRow(row);

              return (
                <tr
                  key={row.pnr}
                  onClick={() => (!isNonEmdTicket ? onSelect(row) : "")}
                  className={[
                    !isNonEmdTicket ? "cursor-pointer" : "cursor-default",
                    getUrgencyRowClass(row, ttlForRow),
                    !getUrgencyRowClass(row, ttlForRow) && !isNonEmdTicket
                      ? "hover:bg-black/5"
                      : "",
                    !isNonEmdTicket && selected?.pnr === row.pnr
                      ? "bg-black/10"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className="align-middle w-10 border-r border-black/10"
                  >
                    {selectable ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(row)}
                        aria-label={`Select PNR ${row.pnr}`}
                      />
                    ) : (
                      <div className="w-4 h-4" aria-hidden="true" />
                    )}
                  </td>

                  {/* PNR */}
                  <td className="w-[140px] font-mono font-semibold text-brand-red whitespace-nowrap border-r border-black/10">
                    {row.pnr}
                  </td>

                  {/* Brand */}
                  <td className="w-[180px] text-black/80 whitespace-nowrap truncate">
                    {row.brand || "-"}
                  </td>

                  {/* GDS */}
                  <td className="w-[120px] text-black/80 whitespace-nowrap">
                    {row.gds || "-"}
                  </td>

                  {/* Store PCC */}
                  <td className="w-[130px] text-black/80 whitespace-nowrap">
                    {row.pcc || "-"}
                  </td>

                  {/* Document Type */}
                  {!isNonEmdTicket && (
                    <td className="w-[150px] text-black/80 whitespace-nowrap">
                      {row.documentType || "-"}
                    </td>
                  )}

                  {/* Status */}
                  {!isNonEmdTicket && (
                    <td className="w-[130px]">
                      <button
                        type="button"
                        className="inline-flex items-center"
                        title={`Stage: ${row.stage ? String(row.stage) : "—"}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Status: ${row.status}. Stage: ${row.stage ? String(row.stage) : "—"}`}
                      >
                        <StatusBadge status={row.status} />
                      </button>
                    </td>
                  )}

                  {/* Passenger Names */}
                  {!isNonEmdTicket && (
                    <td
                      className="w-[260px] text-black/80 truncate"
                      title={row.passengerNames || ""}
                    >
                      {row.passengerNames || "-"}
                    </td>
                  )}

                  {/* Departure Date */}
                  <td className="w-[170px] text-black/80 whitespace-nowrap">
                    {row.departureDate ? toYYYYMMDD(row.departureDate) : "-"}
                  </td>

                  {/* Last Updated */}
                  <td className="w-[190px] text-black/80 whitespace-nowrap">
                    {row.lastUpdated ? formatDate(row.lastUpdated) : "-"}
                  </td>

                  {/* Queue Arrival */}
                  <td className="w-[190px] text-black/80 whitespace-nowrap">
                    {row.queueArrival ? formatDate(row.queueArrival) : "-"}
                  </td>

                  {/* TTL */}

                  <td className="w-[220px] text-black/80 whitespace-nowrap">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 underline-offset-2 text-black/80 hover:text-brand-red"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTTLModalForRow(row);
                      }}
                      title="Set Ticket Time Limit"
                    >
                      {ttlForRow ? toYYYYMMDD(ttlForRow) : "-"}
                      <i className="fa-regular fa-calendar" />
                    </button>
                  </td>

                  {/* Error Details */}
                  {!isNonEmdTicket && (
                    <td className="w-[420px] text-black/80">
                      <p>
                        {row.status === "error" ? (
                          <button
                            type="button"
                            disabled
                            title={row.errorDetailed}
                            className="ml-1 mr-2 inline-flex h-4 w-4 items-center justify-center rounded text-black/50"
                            aria-label="More info about this error"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <i className="fa-solid fa-circle-info text-[14px]" />
                          </button>
                        ) : null}
                        {row.error ? row.error : "-"}
                      </p>
                    </td>
                  )}

                  {/* Assigned */}
                  <td className="w-[240px] text-black/80 truncate">
                    {String(row.assigned ?? "").trim() || "-"}
                  </td>

                  {/* Action */}
                  {/* <td className="w-[220px] text-black/80">
                    {row.action ?? "NA"}
                  </td> */}

                  {isNonEmdTicket && (
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="btn btn-secondary h-7 w-[120px] text-sm justify-center"
                      >
                        Go to Oasis
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {pageRows.length === 0 && (
              <tr>
                <td colSpan={15} className="text-left py-6 text-black/60">
                  {apiLoading ? "Loading..." : "No available data."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-black/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="pageSize" className="text-xs text-black/70">
            Show
          </label>
          <select
            id="pageSize"
            className="input h-9 w-[60px] text-xs"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            disabled={apiLoading}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-sm text-black/70">entries</span>
        </div>

        <div className="text-sm text-black/70">
          Showing <span className="font-medium">{from}</span>
          {" - "}
          <span className="font-medium">{to}</span>
          {" • "}
          <span className="font-medium">{totalRecords}</span> entries • Page{" "}
          <span className="font-medium">{clampedPage}</span> of{" "}
          <span className="font-medium">{totalPages}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="btn h-9 px-3 text-xs"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage <= 1 || totalRecords === 0 || apiLoading}
            aria-label="Previous page"
          >
            Prev
          </button>

          {pageNumbers.map((p) => (
            <button
              key={p}
              className={`btn h-9 px-3 ${p === clampedPage ? "btn-secondary" : ""}`}
              aria-current={p === clampedPage ? "page" : undefined}
              onClick={() => setPage(p)}
              disabled={totalRecords === 0 || apiLoading}
            >
              {p}
            </button>
          ))}

          <button
            className="btn h-9 px-3 text-xs"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={
              clampedPage >= totalPages || totalRecords === 0 || apiLoading
            }
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>

      {/* Assign Modal */}
      <AssignModal
        open={assignOpen}
        onClose={closeAssign}
        assignees={assigneeOptions}
        selectedCount={selectedPNRs.size}
        onConfirm={async ({ mode, selectedAssigneeIds, distribution }) => {
          try {
            if (assigning) return;

            const selectedPNRsArr = Array.from(selectedPNRs);

            if (!selectedPNRsArr.length) {
              showToast("No rows selected", { type: "info" });
              return;
            }

            if (!selectedAssigneeIds?.length) {
              showToast("Choose at least one assignee", { type: "info" });
              return;
            }

            setAssigning(true);

            const dist = distribution?.order?.length
              ? distribution
              : {
                  order: selectedPNRsArr.map(
                    (_, i) =>
                      selectedAssigneeIds[i % selectedAssigneeIds.length],
                  ),
                };

            const byAssignee = selectedPNRsArr.reduce((acc, pnr, idx) => {
              const assigneeId = dist.order[idx];
              const originalIndex = pnrToOriginalIndex.get(pnr);
              if (originalIndex == null) return acc;
              if (!acc[assigneeId]) acc[assigneeId] = [];
              acc[assigneeId].push({ pnr, originalIndex });
              return acc;
            }, {});

            for (const [assigneeId, items] of Object.entries(byAssignee)) {
              if (!items.length) continue;

              const assignee = assigneeOptions.find(
                (a) => String(a.id) === String(assigneeId),
              ) || {
                id: assigneeId,
                name: String(assigneeId),
              };

              await assignPnrsToAssignee(assignee, items);
            }

            const totalAssigned = selectedPNRsArr.length;

            const who =
              mode === "all"
                ? `evenly to all ${assigneeOptions.length} ticketers`
                : `to ${selectedAssigneeIds.length} selected ticketer(s)`;

            showToast(`${totalAssigned} PNR(s) assigned ${who}`, {
              type: "success",
            });

            clearSelection();
            setAssignOpen(false);
          } catch (err) {
            console.error("Assignment error:", err);
            showToast("Failed to assign PNRs. Please try again.", {
              type: "error",
            });
          } finally {
            setAssigning(false);
          }
        }}
      />

      {/* TTL Modal */}
      <TTLModal
        open={ttlModal.open}
        dateStr={ttlModal.dateStr}
        saving={ttlModal.saving}
        onCancel={closeTTLModal}
        onDateChange={(v) =>
          setTtlModal((m) => ({ ...m, dateStr: (v || "").slice(0, 10) }))
        }
        onSave={async () => {
          if (!ttlModal.pnr || ttlModal.originalIndex == null) return;

          if (!ttlModal.dateStr) {
            showToast("Choose a date first", { type: "info" });
            return;
          }

          try {
            setTtlModal((m) => ({ ...m, saving: true }));

            const ttlUtc = ttlInputToUtcIso(ttlModal.dateStr);
            if (!ttlUtc) {
              showToast("Invalid TTL date", { type: "error" });
              setTtlModal((m) => ({ ...m, saving: false }));
              return;
            }

            const payload_utc = {
              ttlUtc,
            };

            // Call the new Set TLL endpoint
            await patchTtlPnr(ttlModal.pnr, payload_utc);

            // Backward compatibility: still notify parent if provided
            const payload = {
              pnr: ttlModal.pnr,
              originalIndex: ttlModal.originalIndex,
              ttl: ttlModal.dateStr,
              ttlUtc,
            };

            try {
              await Promise.resolve(onUpdateTTL?.(payload));
            } catch (cbErr) {
              // Do not fail the operation if parent callback throws
              console.warn("onUpdateTTL callback failed:", cbErr);
            }

            setTtlLocalMap((prev) => {
              const next = new Map(prev);
              next.set(ttlModal.pnr, ttlUtc);
              return next;
            });

            // Refresh list silently to keep row data in sync (without resetting UI state)
            fetchPnrList?.({ silent: true, reason: "ttl-updated" });

            showToast(`TLL updated for ${ttlModal.pnr}`, { type: "success" });
            closeTTLModal();
          } catch (e) {
            console.error("Save TTL failed:", e);
            showToast("Failed to save TTL. Please try again.", {
              type: "error",
            });
            setTtlModal((m) => ({ ...m, saving: false }));
          }
        }}
      />

      <style jsx>{`
        /* Compact table mode (scoped) */
        .pnr-table.compact :global(table.table) {
          border-collapse: separate;
          border-spacing: 0;
        }
        /* Slightly tighter checkbox */
        .pnr-table.compact :global(input[type="checkbox"]) {
          width: 14px;
          height: 14px;
        }
      `}</style>
    </div>
  );
}
