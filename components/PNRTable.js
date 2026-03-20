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

// API
import { getPnrQueueList } from "../api/pnrApi";

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
  /**
   * -----------------------------
   * Helpers
   * -----------------------------
   */
  const includesCI = (value, query) => {
    const v = String(value ?? "").toLowerCase();
    const q = String(query ?? "")
      .trim()
      .toLowerCase();
    if (!q) return true;
    return v.includes(q);
  };

  const normalizeStatus = (raw) => {
    const s = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!s) return "";
    if (s === "error") return "error";
    if (s.includes("human")) return "human";
    if (s.includes("processing")) return "processing";
    if (s.includes("processed") || s.includes("completed")) return "processed";
    return s;
  };

  const uiStatusToApiStatus = (s) => {
    switch (String(s || "").toLowerCase()) {
      case "error":
        return "Error";
      case "human":
        return "Human Input Required";
      case "processing":
        return "Processing";
      case "processed":
        return "Processed";
      default:
        // if user selects a raw status value that already matches backend
        return s || undefined;
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

  const mapSortKeyToSwaggerField = (key) => {
    switch (key) {
      case "pnr":
        return "pnr";
      case "status":
        return "status";
      case "lastUpdated":
        return "lastUpdated";
      case "queueArrival":
        return "queueArrival";
      case "ttl":
        return "ttl";
      case "error":
        return "errorDetails";
      case "assigned":
        return "assignedTo";
      default:
        return "queueArrival";
    }
  };

  const mapApiItemToRow = (item) => ({
    pnr: item?.pnrId ?? item?.pnr ?? "",
    status: normalizeStatus(item?.status),
    stage: item?.stage ?? "",
    lastUpdated: item?.lastUpdated ?? null,
    queueArrival: item?.queueArrival ?? null,
    ttl: item?.ttl ?? null,
    error: item?.errorDetails ?? "",
    assigned: item?.assignedTo ?? "",
    action: item?.actionRequired ?? "",
  });

  const isSelectable = (row) =>
    row.status === "error" || row.status === "human";

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
    assignedNames: [],
    includeUnassigned: false,
  });

  const updateFilter = (key, value) =>
    setColFilters((prev) => ({ ...prev, [key]: value }));

  const [filterOpen, setFilterOpen] = useState({
    pnr: false,
    status: false,
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
      status: false,
      lastUpdated: false,
      queueArrival: false,
      ttl: false,
      error: false,
      assigned: false,
    });

  const isFilterActive = useMemo(
    () => ({
      pnr: !!colFilters.pnr?.trim(),
      status: !!colFilters.status,
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
   * Sorting (server-side)
   * -----------------------------
   */
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };

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

  const statusOptions = useMemo(() => {
    const set = new Set(effectiveRows.map((r) => r.status).filter(Boolean));
    const opts = Array.from(set);
    return opts.length ? opts : ["processed", "processing", "error", "human"];
  }, [effectiveRows]);

  const assigneeOptions = assignees.length
    ? assignees
    : [
        { id: "u1", name: "Susan Wan Chen" },
        { id: "u2", name: "Boden Woolstencroft" },
        { id: "u3", name: "Matt Quiin" },
      ];

  const FILTER_ASSIGNEES = [
    "Susan Wan Chen",
    "Boden Woolstencroft",
    "Matt Quiin",
  ];

  const buildQueryParams = () => {
    const f = colFilters;

    const chosenStatusUi =
      f.status || (statusFilter !== "all" ? statusFilter : "");
    const status = chosenStatusUi
      ? uiStatusToApiStatus(chosenStatusUi)
      : undefined;

    let assignedTo;

    if (Array.isArray(f.assignedNames) && f.assignedNames.length === 1) {
      assignedTo = f.assignedNames[0];
    } else if (
      f.includeUnassigned &&
      (!f.assignedNames || f.assignedNames.length === 0)
    ) {
      assignedTo = "Unassigned";
    } else {
      assignedTo = undefined;
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

    // Sort: "field:dir"
    const sortField = mapSortKeyToSwaggerField(sort.key);
    const sortDir = sort.key ? sort.dir : "desc";
    const sortParam = `${sortField}:${sortDir}`;

    return {
      page: Math.max(1, page), // backend expects 1-based
      pageSize: Math.min(100, Math.max(1, pageSize)),
      status,
      assignedTo,
      pnr,
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

  const fetchPnrList = async () => {
    setApiLoading(true);
    setApiError("");

    try {
      const query = buildQueryParams();
      const res = await getPnrQueueList(query);

      console.log("HELLO");
      console.log("RES: ", res);

      const data = res?.data ?? res;

      const items = Array.isArray(data?.items) ? data.items : [];
      let mapped = items.map(mapApiItemToRow);

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
        Array.isArray(colFilters.assignedNames) &&
        colFilters.assignedNames.length > 0
      ) {
        mapped = mapped.filter((r) => {
          const assignedStr = String(r.assigned ?? "").trim();
          const normalized = assignedStr.toLowerCase();
          const isUnassigned =
            assignedStr.length === 0 ||
            normalized === "unassigned" ||
            assignedStr === "-";

          if (isUnassigned) return true;
          return colFilters.assignedNames.some((name) =>
            includesCI(assignedStr, name),
          );
        });
      }

      setApiRows(mapped);

      setApiMeta({
        page: typeof data?.page === "number" ? data.page : query.page,
        pageSize:
          typeof data?.pageSize === "number" ? data.pageSize : query.pageSize,
        totalRecords:
          typeof data?.totalRecords === "number" ? data.totalRecords : 0,
        totalPages: typeof data?.totalPages === "number" ? data.totalPages : 0,
      });

      if (typeof data?.pageSize === "number" && data.pageSize !== pageSize) {
        setPageSize(data.pageSize);
      }
      if (typeof data?.page === "number" && data.page !== page) {
        setPage(data.page);
      }
    } catch (e) {
      console.error("Fetch PNR list failed:", e);
      setApiError(e?.message || "Failed to load PNR list.");
      setApiRows([]);
      setApiMeta((m) => ({ ...m, totalRecords: 0, totalPages: 0 }));
    } finally {
      setApiLoading(false);
    }
  };

  // Reset to page 1 when filters/sort/search/pageSize change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, colFilters, sort, pageSize]);

  // Debounced fetch on relevant changes
  useEffect(() => {
    const t = setTimeout(() => {
      fetchPnrList();
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sort, statusFilter, search, colFilters]);

  const totalRecords = apiMeta.totalRecords;
  const totalPages = Math.max(1, apiMeta.totalPages || 1);
  const clampedPage = Math.min(page, totalPages);

  const pageRows = effectiveRows;

  const from = totalRecords === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const to =
    totalRecords === 0 ? 0 : Math.min(totalRecords, from + pageRows.length - 1);

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

  const getTTLForRow = (row) => {
    const local = ttlLocalMap.get(row.pnr);
    if (local) return local;
    return row.ttl ?? null;
  };

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

  const [selectedPNRs, setSelectedPNRs] = useState(() => new Set());

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

  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const openAssign = () => setAssignOpen(true);
  const closeAssign = () => {
    if (!assigning) setAssignOpen(false);
  };

  const pageSelectableEligibleCount = useMemo(
    () => pageRows.filter(isSelectable).length,
    [pageRows],
  );

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

          <div className="ml-2 text-xs text-black/50">
            {apiLoading ? "Loading..." : apiError ? "Failed to load" : ""}
          </div>
        </div>
      </div>

      {/* Helper banner */}
      {totalRecords > 0 && pageSelectableEligibleCount === 0 && (
        <div className="mx-3 my-2 px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded">
          No selectable rows in current results. Only <b>Error</b> or{" "}
          <b>Human</b> statuses are eligible for assignment.
        </div>
      )}

      {/* API Error banner */}
      {apiError && (
        <div className="mx-3 my-2 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded">
          {apiError}
        </div>
      )}

      <div
        className="relative overflow-x-auto scroll-smooth min-h-[300px] pb-4"
        tabIndex={0}
        role="region"
        aria-label="PNR results table"
      >
        <table className="table min-w-[1500px] bg-white">
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

              {/* Action Required (filter removed) */}
              <th className="w-[220px] whitespace-nowrap">
                <div className="px-3 py-2 font-semibold text-xs text-black/70">
                  Action Required
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="relative z-[10]">
            {pageRows.map((row) => {
              const selectable = isSelectable(row);
              const isChecked = selectable && selectedPNRs.has(row.pnr);
              const ttlForRow = getTTLForRow(row);

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

            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-black/60">
                  {apiLoading ? "Loading..." : "No matches"}
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
          Showing <span className="font-medium">{from}</span>–{" "}
          <span className="font-medium">{to}</span> of{" "}
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
              ttl: ttlModal.dateStr,
            };

            await Promise.resolve(onUpdateTTL?.(payload));

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
