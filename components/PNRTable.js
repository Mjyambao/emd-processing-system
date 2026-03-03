import { useMemo, useState, useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge";
import Tooltip from "../components/Tooltip";
import Spinner from "../components/Spinner";
import formatDate from "../utils/helper";

/**
 * PNRTable
 * Props:
 *  - rows: array of PNR rows (must include unique `pnr`)
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
        { id: "u1", name: "Agent – Maria R." },
        { id: "u2", name: "Agent – David S." },
        { id: "u3", name: "Agent – Kenji T." },
      ];

  // ─────────────────────────────────────────────────────────────
  // 1) Filtering (index map to preserve original row indices)
  // ─────────────────────────────────────────────────────────────
  const filteredIndices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchStatus = (row) =>
      statusFilter === "all" || row.status === statusFilter;
    return rows.reduce((acc, row, idx) => {
      const matchText =
        !q ||
        row.pnr.toLowerCase().includes(q) ||
        (row.stage && row.stage.toLowerCase().includes(q));
      if (matchText && matchStatus(row)) acc.push(idx);
      return acc;
    }, []);
  }, [rows, search, statusFilter]);

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
  // 2) Pagination
  // ─────────────────────────────────────────────────────────────
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, rows, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount);

  const start = (clampedPage - 1) * pageSize;
  const end = start + pageSize;
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
  // 3) Selection (ONLY for selectable rows)
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
  // 4) Assignment modal
  // ─────────────────────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(assigneeOptions[0]?.id ?? "");
  const assigneeObj = assigneeOptions.find((a) => a.id === assigneeId) || null;

  const openAssign = () => setAssignOpen(true);
  const closeAssign = () => setAssignOpen(false);

  const confirmAssign = () => {
    if (!assigneeObj || selectedPNRs.size === 0) return;
    const items = Array.from(selectedPNRs)
      .map((pnr) => {
        const originalIndex = pnrToOriginalIndex.get(pnr);
        if (originalIndex == null) return null;
        return { pnr, originalIndex };
      })
      .filter(Boolean);
    onAssign?.({ assignee: assigneeObj, items });
    closeAssign();
    clearSelection();
  };

  // ─────────────────────────────────────────────────────────────
  // 5) Row actions
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

  return (
    <div className="card mb-8">
      {/* Header: search + assign/selection summary */}
      <div className="p-3 border-b border-black/10 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="relative w-full md:w-2/3">
          <input
            className="input w-full pl-9"
            placeholder="Search by PNR or Stage"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search PNR or Stage"
          />
          {/* Helper hint (always visible) */}
          {/* <div className="mt-2 text-xs text-black/60 flex items-center gap-2">
            <i className="fa-solid fa-circle-info"></i>
            <span>Hint: only rows with status <span className="font-medium">Error</span> or <span className="font-medium">Human</span> can be selected and assigned.</span>
          </div> */}
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
            disabled={selectedCount === 0}
          >
            <i className="fa-regular fa-paper-plane"></i>
            <span className="ml-2">Assign PNR</span>
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {/* Header checkbox selects only rows with status error/human on current page */}
              <th className="w-10">
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
              <th>PNR</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Last Updated</th>
              <th>Queue Arrival</th>
              <th>Error Details</th>
              <th>Action Required</th>
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
                      ? "ring-1 ring-brand-red/60 bg-red-50"
                      : ""
                  }`}
                >
                  {/* Row checkbox: only render if selectable */}
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className="align-middle"
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

                  <td className="font-mono font-semibold text-brand-red">
                    {row.pnr}
                  </td>

                  <td>
                    <StatusBadge status={row.status} />
                  </td>

                  <td className="text-black/80">{row.stage}</td>

                  <td className="text-black/80">
                    {formatDate("03/02/2026 13:50:20")}
                  </td>

                  <td className="text-black/80">
                    {formatDate("03/02/2026 12:43:19")}
                  </td>

                  <td className="text-black/80 w-1/4">
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
                            <i className="fa-solid fa-circle-info text-[14px]"></i>
                          </button>
                        </Tooltip>
                      ) : null}
                      {row.error}
                    </p>
                  </td>

                  <td className="text-black/80">
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
                            <i className="fa-solid fa-xmark"></i>
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
        assignees={assigneeOptions}
        assigneeId={assigneeId}
        setAssigneeId={setAssigneeId}
        selectedCount={selectedCount}
        onConfirm={confirmAssign}
      />
    </div>
  );
}

/**
 * Simple Tailwind modal (no portal). Closes on overlay click or Esc.
 */
function AssignModal({
  open,
  onClose,
  assignees,
  assigneeId,
  setAssigneeId,
  selectedCount,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="assign-modal-title"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-black/10 flex items-center justify-between">
          <h2 id="assign-modal-title" className="text-base font-semibold">
            Assign {selectedCount} {selectedCount === 1 ? "PNR" : "PNRs"}
          </h2>
          <button
            className="btn h-8 px-2"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <label htmlFor="assignee" className="block text-sm mb-1">
            Assign to
          </label>
          <select
            id="assignee"
            className="input w-full"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <p className="text-xs text-black/60 mt-2">
            The selected PNR{selectedCount === 1 ? "" : "s"} will be assigned to
            the chosen user.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-black/10 flex items-center justify-end gap-2">
          <button className="btn h-9" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary h-9"
            onClick={onConfirm}
            disabled={!assigneeId || selectedCount === 0}
            title="Confirm assignment"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
