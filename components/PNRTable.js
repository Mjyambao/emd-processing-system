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
import toYYYYMMDD from "../utils/helper";

/*
 * PNRTable
 * Props:
 *  - rows: array of PNR rows (must include unique `pnr`)
 *  - search, setSearch
 *  - onRefresh (optional)
 *  - onSelect(row), selected
 *  - onKill(originalIndex)            // accepted (not used in row buttons here)
 *  - statusFilter: 'all'|'processed'|'processing'|'error'|'human'
 *  - isRefreshing (optional)
 *  - killingSet, retryingSet          // accepted (not used in row buttons here)
 *  - assignees: Array<{ id: string|number, name: string }>
 *  - onAssign: fn({ assignee: {id,name}, items: Array<{pnr, originalIndex}> })
 *  - onUpdateTTL: async fn({ pnr, originalIndex, ttl }) => Promise<void>   // NEW
 */

export default function PNRTable({
  rows,
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
}) {
  const isSelectable = (row) =>
    row.status === "error" || row.status === "human";

  const pnrToOriginalIndex = useMemo(() => {
    const map = new Map();
    rows.forEach((r, idx) => map.set(r.pnr, idx));
    return map;
  }, [rows]);

  // Fallback assignees
  const assigneeOptions = assignees.length
    ? assignees
    : [
        { id: "u1", name: "Susan Wan Chen" },
        { id: "u2", name: "Boden Woolstencroft" },
        { id: "u3", name: "Matt Quiin" },
      ];

  // Header filter + Unassigned
  const FILTER_ASSIGNEES = [
    "Susan Wan Chen",
    "Boden Woolstencroft",
    "Matt Quiin",
  ];

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.status).filter(Boolean));
    const dataOptions = Array.from(set);
    if (dataOptions.length) return dataOptions;
    return ["processed", "processing", "error", "human"];
  }, [rows]);

  const statusRank = { error: 1, human: 2, processing: 3, processed: 4 };

  // Toasts
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

  const [colFilters, setColFilters] = useState({
    pnr: "",
    status: "",
    lastUpdatedFrom: "",
    lastUpdatedTo: "",
    queueFrom: "",
    queueTo: "",
    ttlFrom: "",
    ttlTo: "",
    error: "",
    action: "",
    assignedNames: [],
    includeUnassigned: false,
  });
  const updateFilter = (key, value) =>
    setColFilters((prev) => ({ ...prev, [key]: value }));

  // Per-column "filter UI open" state (added action)
  const [filterOpen, setFilterOpen] = useState({
    pnr: false,
    status: false,
    lastUpdated: false,
    queueArrival: false,
    ttl: false,
    error: false,
    assigned: false,
    action: false, // NEW
  });
  const toggleFilterUI = (key) =>
    setFilterOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const closeAllFilterUI = () =>
    setFilterOpen({
      pnr: false,
      status: false,
      lastUpdated: false,
      queueArrival: false,
      ttl: false,
      error: false,
      assigned: false,
      action: false,
    });

  // Active dot indicator per column (added action)
  const isFilterActive = useMemo(
    () => ({
      pnr: !!colFilters.pnr?.trim(),
      status: !!colFilters.status,
      lastUpdated: !!colFilters.lastUpdatedFrom || !!colFilters.lastUpdatedTo,
      queueArrival: !!colFilters.queueFrom || !!colFilters.queueTo,
      ttl: !!colFilters.ttlFrom || !!colFilters.ttlTo,
      error: !!colFilters.error?.trim(),
      action: !!colFilters.action?.trim(), // NEW
      assigned:
        (Array.isArray(colFilters.assignedNames) &&
          colFilters.assignedNames.length > 0) ||
        !!colFilters.includeUnassigned,
    }),
    [colFilters],
  );

  // Close all filter panels with ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") closeAllFilterUI();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };

  const [ttlLocalMap, setTtlLocalMap] = useState(() => new Map());
  // Clean-up any PNRs that no longer exist
  useEffect(() => {
    setTtlLocalMap((prev) => {
      const next = new Map();
      const has = new Set(rows.map((r) => r.pnr));
      for (const [pnr, val] of prev) {
        if (has.has(pnr)) next.set(pnr, val);
      }
      return next;
    });
  }, [rows]);

  const getTTLForRow = (row) => {
    const local = ttlLocalMap.get(row.pnr);
    if (local) return local; // YYYY-MM-DD (from modal)
    return row.ttl ?? null;
  };

  // TTL Modal state
  const [ttlModal, setTtlModal] = useState({
    open: false,
    pnr: null,
    originalIndex: null,
    dateStr: "", // YYYY-MM-DD
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

  // Filtering & sorting
  const filteredIndices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = colFilters;

    const hasDate = (v) => v && !Number.isNaN(new Date(v).getTime());

    const fromLU = hasDate(f.lastUpdatedFrom)
      ? new Date(f.lastUpdatedFrom).getTime()
      : null;
    const toLU = hasDate(f.lastUpdatedTo)
      ? new Date(f.lastUpdatedTo).getTime() + 24 * 3600 * 1000 - 1
      : null;

    const fromQA = hasDate(f.queueFrom)
      ? new Date(f.queueFrom).getTime()
      : null;
    const toQA = hasDate(f.queueTo)
      ? new Date(f.queueTo).getTime() + 24 * 3600 * 1000 - 1
      : null;

    const fromTTL = hasDate(f.ttlFrom) ? new Date(f.ttlFrom).getTime() : null;
    const toTTL = hasDate(f.ttlTo)
      ? new Date(f.ttlTo).getTime() + 24 * 3600 * 1000 - 1
      : null;

    const matchStatusGlobal = (row) =>
      statusFilter === "all" || row.status === statusFilter;

    const matchColFilters = (row) => {
      // PNR text
      if (
        f.pnr &&
        !String(row.pnr || "")
          .toLowerCase()
          .includes(f.pnr.toLowerCase())
      )
        return false;

      // Status
      if (f.status && row.status !== f.status) return false;

      // Last Updated range
      if (fromLU != null || toLU != null) {
        const t =
          row.lastUpdated != null ? new Date(row.lastUpdated).getTime() : null;
        if (t == null) return false;
        if (fromLU != null && t < fromLU) return false;
        if (toLU != null && t > toLU) return false;
      }

      // Queue Arrival range
      if (fromQA != null || toQA != null) {
        const t =
          row.queueArrival != null
            ? new Date(row.queueArrival).getTime()
            : null;
        if (t == null) return false;
        if (fromQA != null && t < fromQA) return false;
        if (toQA != null && t > toQA) return false;
      }

      // TTL range (uses local override if present)
      if (fromTTL != null || toTTL != null) {
        const ttl = getTTLForRow(row);
        if (!ttl) return false;
        const t = new Date(ttl).getTime();
        if (Number.isNaN(t)) return false;
        if (fromTTL != null && t < fromTTL) return false;
        if (toTTL != null && t > toTTL) return false;
      }

      // Error text
      if (
        f.error &&
        !String(row.error || "")
          .toLowerCase()
          .includes(f.error.toLowerCase())
      )
        return false;

      if (
        f.action &&
        !String(row.action || "")
          .toLowerCase()
          .includes(f.action.toLowerCase())
      )
        return false;

      // Assigned filter (committed only on Done)
      const assignedFilterActive =
        (Array.isArray(f.assignedNames) && f.assignedNames.length > 0) ||
        f.includeUnassigned;

      if (assignedFilterActive) {
        const assignedRaw = row.assigned;
        const assignedStr = String(assignedRaw ?? "").trim();

        // Treat "", "Unassigned", "-" as unassigned
        const normalized = assignedStr.toLowerCase();
        const isUnassigned =
          assignedStr.length === 0 ||
          normalized === "unassigned" ||
          assignedStr === "-";

        if (isUnassigned) {
          // Include if 'Unassigned' checkbox selected
          return !!f.includeUnassigned;
        }

        // Row has assignees
        const assignedList = assignedStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        if (f.assignedNames.length > 0) {
          const hit = f.assignedNames.some((name) =>
            assignedList.includes(name),
          );
          if (!hit) return false;
        } else {
          if (f.includeUnassigned) return false;
        }
      }

      return true;
    };

    const indices = rows.reduce((acc, row, idx) => {
      const matchSearch =
        !q ||
        String(row.pnr || "")
          .toLowerCase()
          .includes(q) ||
        (row.stage && String(row.stage).toLowerCase().includes(q));

      if (matchSearch && matchStatusGlobal(row) && matchColFilters(row))
        acc.push(idx);
      return acc;
    }, []);

    // Sorting
    if (!sort.key) {
      const priority = { error: 1, human: 2, processing: 3, processed: 4 };
      const getTime = (v) => {
        if (v == null) return -Infinity;
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? -Infinity : t;
      };

      indices.sort((a, b) => {
        const ra = priority[rows[a].status] ?? Number.MAX_SAFE_INTEGER;
        const rb = priority[rows[b].status] ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;

        const ta = getTime(rows[a].queueArrival);
        const tb = getTime(rows[b].queueArrival);
        if (ta !== tb) return tb - ta; // newest first

        // stable by original index
        return a - b;
      });

      return indices;
    }

    const getVal = (row, key) => {
      switch (key) {
        case "pnr":
          return String(row.pnr || "").toLowerCase();
        case "status":
          return statusRank[row.status] ?? Number.MAX_SAFE_INTEGER;
        case "lastUpdated": {
          const t =
            row.lastUpdated != null
              ? new Date(row.lastUpdated).getTime()
              : -Infinity;
          return Number.isNaN(t) ? -Infinity : t;
        }
        case "queueArrival": {
          const t =
            row.queueArrival != null
              ? new Date(row.queueArrival).getTime()
              : -Infinity;
          return Number.isNaN(t) ? -Infinity : t;
        }
        case "ttl": {
          const ttl = getTTLForRow(row);
          if (!ttl) return -Infinity;
          const t = new Date(ttl).getTime();
          return Number.isNaN(t) ? -Infinity : t;
        }
        case "error":
          return String(row.error || "").toLowerCase();
        case "assigned":
          return String(row.assigned || "").toLowerCase();
        case "action":
          return String(row.action || "").toLowerCase();
        default:
          return "";
      }
    };

    const dir = sort.dir === "asc" ? 1 : -1;
    indices.sort((a, b) => {
      const va = getVal(rows[a], sort.key);
      const vb = getVal(rows[b], sort.key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a - b;
    });

    return indices;
  }, [rows, search, statusFilter, colFilters, sort, ttlLocalMap]);

  const filtered = useMemo(
    () => filteredIndices.map((i) => rows[i]),
    [rows, filteredIndices],
  );

  const filteredSelectableCount = useMemo(
    () => filtered.filter(isSelectable).length,
    [filtered],
  );

  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, rows, pageSize, colFilters, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount);

  const start = (clampedPage - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = filtered.slice(start, end);

  const total = filtered.length;
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(total, end);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    let startPage = Math.max(1, clampedPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(pageCount, startPage + maxButtons - 1);
    startPage = Math.max(1, endPage - maxButtons + 1);
    return Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i,
    );
  }, [clampedPage, pageCount]);

  // Selection (only for selectable rows)
  const [selectedPNRs, setSelectedPNRs] = useState(() => new Set());

  useEffect(() => {
    setSelectedPNRs((prev) => {
      const next = new Set();
      for (const pnr of prev) {
        const idx = pnrToOriginalIndex.get(pnr);
        const row = idx != null ? rows[idx] : null;
        if (row && isSelectable(row)) next.add(pnr);
      }
      return next;
    });
  }, [rows, pnrToOriginalIndex]);

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
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = pageSomeSelected;
    }
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
      if (pageAllSelected) {
        pageSelectablePNRs.forEach((pnr) => next.delete(pnr));
      } else {
        pageSelectablePNRs.forEach((pnr) => next.add(pnr));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedPNRs(new Set());

  // Assignment modal + loading state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const openAssign = () => setAssignOpen(true);
  const closeAssign = () => {
    if (!assigning) setAssignOpen(false);
  };

  // Filter icon helper (inline next to header text)
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

  return (
    <div className="card mb-8 relative">
      {/* Toasts */}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="p-3 border-b border-black/10 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            className="btn btn-primary h-[40px] justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            title={
              selectedCount > 0
                ? "Assign selected PNRs"
                : "Select eligible rows to enable"
            }
            onClick={openAssign}
            disabled={selectedCount === 0 || assigning}
          >
            <i className="fa-regular fa-paper-plane" />
            <span className="ml-2">
              {assigning ? "Assigning..." : "Assign PNR"}
            </span>
          </button>
          <div className="text-sm text-black/70">{selectedCount} selected</div>
        </div>
      </div>

      {/* Helper banner */}
      {total > 0 && filteredSelectableCount === 0 && (
        <div className="mx-3 my-2 px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded">
          No selectable rows in current results. Only <b>Error</b> or{" "}
          <b>Human</b> statuses are eligible for assignment.
        </div>
      )}

      <div
        className="relative overflow-x-auto scroll-smooth min-h-[300px] pb-4"
        tabIndex={0}
        role="region"
        aria-label="PNR results table"
      >
        <table className="table min-w-[1500px] bg-white">
          {/* Raise header above tooltips so filter icons remain clickable */}
          <thead className="relative z-[60]">
            <tr>
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
                      className="input h-8 text-xs w-full"
                      placeholder="Filter PNR…"
                      value={colFilters.pnr}
                      onChange={(e) => updateFilter("pnr", e.target.value)}
                    />
                  </div>
                )}
              </ThWithFilter>

              {/* Status */}
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
                      className="input h-8 text-xs w-full"
                      value={colFilters.status}
                      onChange={(e) => updateFilter("status", e.target.value)}
                    >
                      <option value="">All</option>
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
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
                  <div className="mt-1 flex gap-1">
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
                  <div className="mt-1 flex gap-1">
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
                  <div className="mt-1 flex gap-1">
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
                      className="input h-8 text-xs w-full"
                      placeholder="Filter error…"
                      value={colFilters.error}
                      onChange={(e) => updateFilter("error", e.target.value)}
                    />
                  </div>
                )}
              </ThWithFilter>

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

              <ThWithFilter
                label={
                  <span className="inline-flex items-center gap-1">
                    Action Required
                    <FilterToggleButton
                      open={filterOpen.action}
                      active={isFilterActive.action}
                      onClick={() => toggleFilterUI("action")}
                      label="Action Required"
                    />
                  </span>
                }
                widthClass="w-[220px]"
                sortKey="action"
                sort={sort}
                onSort={toggleSort}
              >
                {filterOpen.action && (
                  <div className="mt-1">
                    <input
                      className="input h-8 text-xs w-full"
                      placeholder="Filter action…"
                      value={colFilters.action}
                      onChange={(e) => updateFilter("action", e.target.value)}
                    />
                  </div>
                )}
              </ThWithFilter>
            </tr>
          </thead>

          <tbody className="relative z-[10]">
            {pageRows.map((row) => {
              const selectable = isSelectable(row);
              const isChecked = selectable && selectedPNRs.has(row.pnr);
              const ttlForRow = getTTLForRow(row); // could be null or 'YYYY-MM-DD'

              return (
                <tr
                  key={row.pnr}
                  onClick={() => onSelect(row)}
                  className={`cursor-pointer hover:bg-black/5 ${
                    selected?.pnr === row.pnr
                      ? "ring-1 ring-brand-red/60 bg-white"
                      : ""
                  }`}
                >
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className="align-middle w-12 border-r border-black/10"
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

                  <td className="w-[140px] font-mono font-semibold text-brand-red whitespace-nowrap border-r border-black/10">
                    {row.pnr}
                  </td>

                  <td className="w-[130px]">
                    <button
                      type="button"
                      className="inline-flex items-center"
                      title={`Stage: ${row.stage ? String(row.stage) : "—"}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Status: ${row.status}. Stage: ${
                        row.stage ? String(row.stage) : "—"
                      }`}
                    >
                      <StatusBadge status={row.status} />
                    </button>
                  </td>

                  <td className="w-[190px] text-black/80 whitespace-nowrap">
                    {row.lastUpdated ? formatDate(row.lastUpdated) : "-"}
                  </td>

                  <td className="w-[190px] text-black/80 whitespace-nowrap">
                    {row.queueArrival ? formatDate(row.queueArrival) : "-"}
                  </td>

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

                  <td className="w-[420px] text-black/80">
                    <p>
                      {row.status === "error" ? (
                        <Tooltip
                          position="bottom"
                          offset={8}
                          content={
                            <ul className="list-disc pl-4">
                              <li className="text-[12px] mt-1">
                                Error suggestions:
                              </li>
                              <li className="text-[12px] mt-1">
                                Verify RFIC/RFISC mapping
                              </li>
                              <li className="text-[12px] mt-1">
                                Fix missing or invalid tour/corporate code
                              </li>
                            </ul>
                          }
                        >
                          <button
                            type="button"
                            className="ml-1 mr-2 inline-flex h-4 w-4 items-center justify-center rounded text-black/50 hover:text-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                            aria-label="More info about this error"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <i className="fa-solid fa-circle-info text-[14px]" />
                          </button>
                        </Tooltip>
                      ) : null}
                      {row.error}
                    </p>
                  </td>

                  <td className="w-[240px] text-black/80 truncate">
                    {String(row.assigned ?? "").trim() || "-"}
                  </td>

                  <td className="w-[220px] text-black/80">
                    {row.action ?? "NA"}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-black/60">
                  No matches
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
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span className="text-sm text-black/70">entries</span>
        </div>

        <div className="text-sm text-black/70">
          Showing <span className="font-medium">{from}</span>–
          <span className="font-medium">{to}</span> of{" "}
          <span className="font-medium">{total}</span> entries
        </div>

        <div className="flex items-center gap-1">
          <button
            className="btn h-9 px-3 text-xs"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage <= 1 || total === 0}
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
              disabled={total === 0}
            >
              {p}
            </button>
          ))}

          <button
            className="btn h-9 px-3 text-xs"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={clampedPage >= pageCount || total === 0}
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

            // Group by assignee and call onAssign
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
              await Promise.resolve(onAssign?.({ assignee, items }));
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
            const payload = {
              pnr: ttlModal.pnr,
              originalIndex: ttlModal.originalIndex,
              ttl: ttlModal.dateStr, // YYYY-MM-DD
            };

            // Persist to parent/backend
            await Promise.resolve(onUpdateTTL?.(payload));

            // Reflect immediately in UI
            setTtlLocalMap((prev) => {
              const next = new Map(prev);
              next.set(ttlModal.pnr, ttlModal.dateStr);
              return next;
            });

            showToast(`TTL saved for ${ttlModal.pnr}`, { type: "success" });
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
    </div>
  );
}
