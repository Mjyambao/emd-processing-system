import { useMemo, useState, useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge";
import Tooltip from "../components/Tooltip";
import Spinner from "../components/Spinner";
import AssignModal from "../components/AssignModal";
import formatDate from "../utils/helper";

/**
 * PNRTable
 * Props:
 *  - rows: array of PNR rows (must include unique `pnr`)
 *      Suggested optional fields for filtering/sorting:
 *        - lastUpdated: string | number (Date-compatible)
 *        - queueArrival: string | number (Date-compatible)
 *  - search: string
 *  - setSearch: fn
 *  - onRefresh: fn (optional; not wired to a button here)
 *  - onSelect: fn(row)
 *  - selected: selected row object
 *  - onKill: fn(originalIndex)
 *  - statusFilter: 'all'|'processed'|'processing'|'error'|'human'
 *  - isRefreshing: boolean (optional)
 *  - killingSet: Set of PNR strings currently being killed
 *  - retryingSet: Set of PNR strings currently being retried (optional)
 *  - assignees: Array<{ id: string|number, name: string }>
 *  - onAssign: fn({ assignee: {id,name}, items: Array<{pnr, originalIndex}> })
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
}) {
  // ─────────────────────────────────────────────────────────────
  // 0) Helpers
  // ─────────────────────────────────────────────────────────────
  const isSelectable = (row) =>
    row.status === "error" || row.status === "human";

  // Map PNR -> original index for stable references
  const pnrToOriginalIndex = useMemo(() => {
    const map = new Map();
    rows.forEach((r, idx) => map.set(r.pnr, idx));
    return map;
  }, [rows]);

  const assigneeOptions = assignees.length
    ? assignees
    : [
        { id: "u1", name: "Suzan Wan Chen" },
        { id: "u2", name: "Boden Woolstencroft" },
        { id: "u3", name: "Matt Quinn" },
      ];

  // Unique status options from data (fallback)
  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.status).filter(Boolean));
    const dataOptions = Array.from(set);
    if (dataOptions.length) return dataOptions;
    return ["processed", "processing", "error", "human"];
  }, [rows]);

  // Status sort ranking (tweak to your preference)
  const statusRank = {
    error: 1,
    human: 2,
    processing: 3,
    processed: 4,
  };

  // ─────────────────────────────────────────────────────────────
  // Toasts (lightweight)
  // ─────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]); // {id, type, message}
  const toastIdRef = useRef(0);
  const showToast = (message, { type = "success", duration = 4000 } = {}) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  };
  const dismissToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  // ─────────────────────────────────────────────────────────────
  // 1) Column filters + sorting state
  // ─────────────────────────────────────────────────────────────
  const [colFilters, setColFilters] = useState({
    pnr: "",
    status: "", // empty means no filter; you also have global statusFilter above
    stage: "",
    lastUpdatedFrom: "", // yyyy-mm-dd
    lastUpdatedTo: "",
    queueFrom: "",
    queueTo: "",
    error: "",
    action: "",
  });

  const updateFilter = (key, value) =>
    setColFilters((prev) => ({ ...prev, [key]: value }));

  // Sort state: key & dir
  const [sort, setSort] = useState({ key: null, dir: "asc" }); // dir: 'asc' | 'desc'
  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" }; // clear sorting
    });
  };

  // ─────────────────────────────────────────────────────────────
  // 2) Filtering (+ search + global status filter) & sorting
  // ─────────────────────────────────────────────────────────────
  const filteredIndices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = colFilters;
    const hasDate = (v) => v && !Number.isNaN(new Date(v).getTime());
    const fromLU = hasDate(f.lastUpdatedFrom)
      ? new Date(f.lastUpdatedFrom).getTime()
      : null;
    const toLU = hasDate(f.lastUpdatedTo)
      ? new Date(f.lastUpdatedTo).getTime() + 24 * 3600 * 1000 - 1
      : null; // inclusive
    const fromQA = hasDate(f.queueFrom)
      ? new Date(f.queueFrom).getTime()
      : null;
    const toQA = hasDate(f.queueTo)
      ? new Date(f.queueTo).getTime() + 24 * 3600 * 1000 - 1
      : null;

    const matchStatusGlobal = (row) =>
      statusFilter === "all" || row.status === statusFilter;

    const matchColFilters = (row) => {
      // PNR (text)
      if (
        f.pnr &&
        !String(row.pnr || "")
          .toLowerCase()
          .includes(f.pnr.toLowerCase())
      ) {
        return false;
      }
      // Status (select)
      if (f.status && row.status !== f.status) return false;
      // Stage (text)
      if (
        f.stage &&
        !String(row.stage || "")
          .toLowerCase()
          .includes(f.stage.toLowerCase())
      ) {
        return false;
      }
      // Last Updated (date range)
      if (fromLU != null || toLU != null) {
        const t =
          row.lastUpdated != null ? new Date(row.lastUpdated).getTime() : null;
        if (t == null) return false; // no value -> doesn't pass a date filter
        if (fromLU != null && t < fromLU) return false;
        if (toLU != null && t > toLU) return false;
      }
      // Queue Arrival (date range)
      if (fromQA != null || toQA != null) {
        const t =
          row.queueArrival != null
            ? new Date(row.queueArrival).getTime()
            : null;
        if (t == null) return false;
        if (fromQA != null && t < fromQA) return false;
        if (toQA != null && t > toQA) return false;
      }
      // Error (text)
      if (
        f.error &&
        !String(row.error || "")
          .toLowerCase()
          .includes(f.error.toLowerCase())
      ) {
        return false;
      }
      // Action (text)
      if (
        f.action &&
        !String(row.action || "")
          .toLowerCase()
          .includes(f.action.toLowerCase())
      ) {
        return false;
      }
      return true;
    };

    const indices = rows.reduce((acc, row, idx) => {
      // Global search: PNR or Stage only (your previous behavior)
      const matchSearch =
        !q ||
        String(row.pnr || "")
          .toLowerCase()
          .includes(q) ||
        (row.stage && String(row.stage).toLowerCase().includes(q));

      if (matchSearch && matchStatusGlobal(row) && matchColFilters(row)) {
        acc.push(idx);
      }
      return acc;
    }, []);

    // Sorting
    if (!sort.key) return indices;

    const getVal = (row, key) => {
      switch (key) {
        case "pnr":
          return String(row.pnr || "").toLowerCase();
        case "status":
          return statusRank[row.status] ?? Number.MAX_SAFE_INTEGER;
        case "stage":
          return String(row.stage || "").toLowerCase();
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
        case "error":
          return String(row.error || "").toLowerCase();
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
      // stable fallback by original index to avoid jitter
      return a - b;
    });

    return indices;
  }, [rows, search, statusFilter, colFilters, sort]);

  const filtered = useMemo(
    () => filteredIndices.map((i) => rows[i]),
    [rows, filteredIndices],
  );

  // Count eligible rows in current filtered set (for helper banners)
  const filteredSelectableCount = useMemo(
    () => filtered.filter(isSelectable).length,
    [filtered],
  );

  // ─────────────────────────────────────────────────────────────
  // 3) Pagination
  // ─────────────────────────────────────────────────────────────
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, rows, pageSize, colFilters, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount);

  const start = (clampedPage - 1) * pageSize;
  const end = start + pageSize;
  theadHeightAdjustHack(); // ensure stickies recalc (no-op; see fn below)
  const pageRows = filtered.slice(start, end);

  // Show "X–Y of Z"
  const total = filtered.length;
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(total, end);

  // Page number buttons (max 5 visible)
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

  // ─────────────────────────────────────────────────────────────
  // 4) Selection (ONLY for selectable rows)
  // ─────────────────────────────────────────────────────────────
  const [selectedPNRs, setSelectedPNRs] = useState(() => new Set());

  // Prune selections that are no longer selectable (status changed)
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

  // Derive selectable PNRs for current page
  const pageSelectablePNRs = pageRows.filter(isSelectable).map((r) => r.pnr);
  const pageSelectableCount = pageSelectablePNRs.length;
  const pageSelectedCount = pageSelectablePNRs.reduce(
    (cnt, pnr) => cnt + (selectedPNRs.has(pnr) ? 1 : 0),
    0,
  );
  const pageAllSelected =
    pageSelectableCount > 0 && pageSelectedCount === pageSelectableCount;
  const pageSomeSelected = pageSelectedCount > 0 && !pageAllSelected;

  // Header checkbox indeterminate state
  const headerCbRef = useRef(null);
  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = pageSomeSelected;
    }
  }, [pageSomeSelected]);

  const toggleRow = (row) => {
    if (!isSelectable(row)) return; // guard
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

  // ─────────────────────────────────────────────────────────────
  // 5) Assignment modal + loading state
  // ─────────────────────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false); // spinner/disable during confirm

  const openAssign = () => setAssignOpen(true);
  const closeAssign = () => {
    if (!assigning) setAssignOpen(false);
  };

  // ─────────────────────────────────────────────────────────────
  // 6) Horizontal scroll fades (left/right) visibility
  // ─────────────────────────────────────────────────────────────
  const scrollRef = useRef(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 1);
  };

  useEffect(() => {
    updateFades();
  }, [filtered, page, pageSize, colFilters, sort]);

  // ─────────────────────────────────────────────────────────────
  // 7) Row actions
  // ─────────────────────────────────────────────────────────────
  function handleKill(viewIndexOnPage, e) {
    e.stopPropagation();
    const globalViewIndex = start + viewIndexOnPage;
    const originalIndex = filteredIndices[globalViewIndex];
    if (originalIndex == null) return;
    onKill?.(originalIndex);
  }

  function handleRetry(viewIndexOnPage, e) {
    e.stopPropagation();
    // TODO: wire a real onRetry callback if needed
  }

  // ─────────────────────────────────────────────────────────────
  // 8) Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="card mb-8 relative">
      {/* Toasts */}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      {/* Header: search + assign/selection summary */}
      <div className="p-3 border-b border-black/10 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="relative w-full md:w-2/3">
          {/* <input
            className="input w-full pl-9"
            placeholder="Search by PNR or Stage"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search PNR or Stage"
          /> */}
        </div>

        {/* Always show Assign PNR; disabled when no selection */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="text-sm text-black/70">{selectedCount} selected</div>
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
        </div>
      </div>

      {/* If there are results but none are eligible, show info banner */}
      {total > 0 && filteredSelectableCount === 0 && (
        <div className="mx-3 my-2 px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded">
          No selectable rows in current results. Only <b>Error</b> or{" "}
          <b>Human</b> statuses are eligible for assignment.
        </div>
      )}

      {/* Table (horizontally scrollable with sticky header & columns) */}
      <div
        ref={scrollRef}
        onScroll={updateFades}
        className="relative overflow-x-auto scroll-smooth"
        tabIndex={0}
        role="region"
        aria-label="PNR results table"
      >
        {/* left & right edge fades to indicate overflow (beneath sticky cells) */}
        {showLeftFade && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent z-40"
            aria-hidden="true"
          />
        )}
        {showRightFade && (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent z-40"
            aria-hidden="true"
          />
        )}

        <table className="table min-w-[1280px] bg-white">
          <thead>
            <tr>
              {/* Sticky header cells. First two columns also sticky-left */}
              <ThStickyCheckboxHeader
                headerCbRef={headerCbRef}
                pageAllSelected={pageAllSelected}
                pageSelectableCount={pageSelectableCount}
                toggleSelectAllPage={toggleSelectAllPage}
              />
              <ThWithFilter
                label="PNR"
                stickyLeft
                leftPx={8}
                widthClass="w-[140px]"
                sortKey="pnr"
                sort={sort}
                onSort={toggleSort}
              >
                <input
                  className="input h-8 text-xs"
                  placeholder="Filter PNR…"
                  value={colFilters.pnr}
                  onChange={(e) => updateFilter("pnr", e.target.value)}
                />
              </ThWithFilter>

              <ThWithFilter
                label="Status"
                widthClass="w-[130px]"
                sortKey="status"
                sort={sort}
                onSort={toggleSort}
              >
                <select
                  className="input h-8 text-xs"
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
              </ThWithFilter>

              <ThWithFilter
                label="Stage"
                widthClass="w-[180px]"
                sortKey="stage"
                sort={sort}
                onSort={toggleSort}
              >
                <input
                  className="input h-8 text-xs"
                  placeholder="Filter stage…"
                  value={colFilters.stage}
                  onChange={(e) => updateFilter("stage", e.target.value)}
                />
              </ThWithFilter>

              <ThWithFilter
                label="Last Updated"
                widthClass="w-[190px]"
                nowrap
                sortKey="lastUpdated"
                sort={sort}
                onSort={toggleSort}
              >
                <div className="flex gap-1">
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
              </ThWithFilter>

              <ThWithFilter
                label="Queue Arrival"
                widthClass="w-[190px]"
                nowrap
                sortKey="queueArrival"
                sort={sort}
                onSort={toggleSort}
              >
                <div className="flex gap-1">
                  <input
                    type="date"
                    className="input h-8 text-xs"
                    value={colFilters.queueFrom}
                    onChange={(e) => updateFilter("queueFrom", e.target.value)}
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
              </ThWithFilter>

              <ThWithFilter
                label="Error Details"
                widthClass="w-[420px]"
                sortKey="error"
                sort={sort}
                onSort={toggleSort}
              >
                <input
                  className="input h-8 text-xs"
                  placeholder="Filter error…"
                  value={colFilters.error}
                  onChange={(e) => updateFilter("error", e.target.value)}
                />
              </ThWithFilter>

              <ThWithFilter
                label="Action Required"
                widthClass="w-[220px]"
                sortKey="action"
                sort={sort}
                onSort={toggleSort}
              >
                <input
                  className="input h-8 text-xs"
                  placeholder="Filter action…"
                  value={colFilters.action}
                  onChange={(e) => updateFilter("action", e.target.value)}
                />
              </ThWithFilter>
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row, viewIdx) => {
              const isKilling = killingSet.has(row.pnr);
              const isRetrying = retryingSet.has(row.pnr);
              const selectable = isSelectable(row);
              const isChecked = selectable && selectedPNRs.has(row.pnr);

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
                  {/* Row checkbox: only render if selectable (sticky left col 1) */}
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className="align-middle w-12 sticky left-0 bg-white z-[70] border-r border-black/10"
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

                  {/* Sticky left col 2: PNR */}
                  <td className="w-[140px] font-mono font-semibold text-brand-red whitespace-nowrap sticky left-8 bg-white z-[65] border-r border-black/10">
                    {row.pnr}
                  </td>

                  <td className="w-[130px]">
                    <StatusBadge status={row.status} />
                  </td>

                  <td className="w-[180px] text-black/80 truncate">
                    {row.stage}
                  </td>

                  <td className="w-[190px] text-black/80 whitespace-nowrap">
                    {/* Display fallback for now if your data lacks date fields */}
                    {row.lastUpdated
                      ? formatDate(row.lastUpdated)
                      : formatDate("03/02/2026 13:50:20")}
                  </td>

                  <td className="w-[190px] text-black/80 whitespace-nowrap">
                    {row.queueArrival
                      ? formatDate(row.queueArrival)
                      : formatDate("03/02/2026 12:43:19")}
                  </td>

                  <td className="w-[420px] text-black/80">
                    <p>
                      {row.status === "error" ? (
                        <Tooltip
                          position="top"
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

                  <td className="w-[220px] text-black/80">
                    {row.status === "error" ? (
                      <>
                        <button
                          className="btn btn-secondary h-8 p-2 mr-2"
                          title="Retry process"
                          onClick={(e) => handleRetry(viewIdx, e)}
                          disabled={isRetrying || isKilling}
                        >
                          {isRetrying ? <Spinner /> : "Retry"}
                        </button>
                        <button
                          className="btn btn-primary h-8 mt-2"
                          title="Kill process"
                          onClick={(e) => handleKill(viewIdx, e)}
                          disabled={isKilling || isRetrying}
                        >
                          {isKilling ? (
                            <Spinner />
                          ) : (
                            <i className="fa-solid fa-xmark" />
                          )}
                        </button>
                      </>
                    ) : (
                      (row.action ?? "NA")
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-black/60">
                  No matches
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: Show dropdown + summary + pagination */}
      <div className="p-2 border-t border-black/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Show dropdown */}
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

        {/* Summary */}
        <div className="text-sm text-black/70">
          Showing <span className="font-medium">{from}</span>–
          <span className="font-medium">{to}</span> of{" "}
          <span className="font-medium">{total}</span> entries
        </div>

        {/* Pagination controls */}
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
        assignees={assignees}
        selectedCount={selectedPNRs.size}
        confirmLoading={assigning} // spinner in Confirm button
        onConfirm={async ({ mode, selectedAssigneeIds, distribution }) => {
          try {
            if (assigning) return; // guard double-clicks
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

            // Fallback distribution if missing (shouldn't happen)
            let dist = distribution;
            if (!dist?.order?.length) {
              const fallbackOrder = selectedPNRsArr.map(
                (_, i) => selectedAssigneeIds[i % selectedAssigneeIds.length],
              );
              dist = { perAssignee: {}, order: fallbackOrder };
            }

            // Group items by assignee according to dist.order
            const byAssignee = selectedPNRsArr.reduce((acc, pnr, idx) => {
              const assigneeId = dist.order[idx];
              const originalIndex = pnrToOriginalIndex.get(pnr);
              if (originalIndex == null) return acc;
              if (!acc[assigneeId]) acc[assigneeId] = [];
              acc[assigneeId].push({ pnr, originalIndex });
              return acc;
            }, {});

            // Call existing onAssign once per assignee (await if it returns a promise)
            for (const [assigneeId, items] of Object.entries(byAssignee)) {
              if (!items.length) continue;
              const assignee = assigneeOptions.find(
                (a) => String(a.id) === String(assigneeId),
              ) || { id: assigneeId, name: String(assigneeId) };

              await Promise.resolve(onAssign?.({ assignee, items }));
            }

            const totalAssigned = selectedPNRsArr.length;
            const who =
              mode === "all"
                ? `evenly to all ${assignees.length} ticketers`
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
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sticky Header Helpers / Components
   ───────────────────────────────────────────────────────────── */

// A tiny no-op to make React run this area each render (keeps sticky layout consistent).
function theadHeightAdjustHack() {}

function SortIcon({ active, dir }) {
  if (!active) return <i className="fa-solid fa-sort text-black/40" />;
  return dir === "asc" ? (
    <i className="fa-solid fa-sort-up text-brand-red" />
  ) : (
    <i className="fa-solid fa-sort-down text-brand-red" />
  );
}

function ThWithFilter({
  label,
  children,
  widthClass = "",
  nowrap = false,
  sortKey,
  sort,
  onSort,
  stickyLeft = false,
  leftPx = 0, // for sticky left offset
}) {
  // z-index ladder for headers: left-most > next > others
  const baseSticky = stickyLeft
    ? `sticky left-${leftPx} top-0 z-[85] bg-white border-r border-black/10`
    : `sticky top-0 z-[80] bg-white`;

  return (
    <th
      className={`${widthClass} ${nowrap ? "whitespace-nowrap" : ""} ${baseSticky}`}
      scope="col"
    >
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onSort?.(sortKey)}
          className="flex items-center justify-between w-full text-left"
          title={`Sort by ${label}`}
        >
          <span className="font-medium">{label}</span>
          <span className="ml-2">
            <SortIcon active={sort.key === sortKey} dir={sort.dir} />
          </span>
        </button>

        {/* Filter control */}
        {children}
      </div>
    </th>
  );
}

function ThStickyCheckboxHeader({
  headerCbRef,
  pageAllSelected,
  pageSelectableCount,
  toggleSelectAllPage,
}) {
  return (
    <th
      className="w-12 sticky left-0 top-0 z-[90] bg-white border-r border-black/10"
      scope="col"
    >
      <input
        ref={headerCbRef}
        type="checkbox"
        checked={pageAllSelected && pageSelectableCount > 0}
        onChange={toggleSelectAllPage}
        aria-label="Select all eligible rows on this page"
        disabled={pageSelectableCount === 0}
        title={
          pageSelectableCount === 0
            ? "No eligible rows on this page"
            : "Select all eligible rows on this page"
        }
      />
    </th>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tiny Toast UI (no external deps)
   ───────────────────────────────────────────────────────────── */
function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`min-w-[260px] max-w-[360px] rounded-lg shadow-lg border px-3 py-2 text-sm flex items-start gap-2
            ${
              t.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : t.type === "info"
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
        >
          <span className="mt-[2px]">
            {t.type === "error" ? "⛔" : t.type === "info" ? "ℹ️" : "✅"}
          </span>
          <div className="flex-1">{t.message}</div>
          <button
            className="text-black/50 hover:text-black"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
