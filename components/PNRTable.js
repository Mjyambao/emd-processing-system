import { useMemo, useState, useEffect } from 'react'
import StatusBadge from './StatusBadge'
import Tooltip from '../components/Tooltip'
import Spinner from '../components/Spinner'
import formatDate from '../utils/helper'

/**
 * PNRTable
 * Props:
 *  - rows: array of PNR rows
 *  - search: string
 *  - setSearch: fn
 *  - onRefresh: fn
 *  - onSelect: fn(row)
 *  - selected: selected row object
 *  - onKill: fn(originalIndex)
 *  - statusFilter: 'all'|'processed'|'processing'|'error'|'human'
 *  - isRefreshing: boolean (optional; to spin the refresh button)
 *  - killingSet: Set of PNR strings currently being killed
 *  - retryingSet: Set of PNR strings currently being retried (optional)
 */
export default function PNRTable({
  rows,
  search,
  setSearch,
  onRefresh,
  onSelect,
  selected,
  onKill,
  statusFilter = 'all',
  isRefreshing = false,
  killingSet = new Set(),
  retryingSet = new Set(),
}) {
  // ─────────────────────────────────────────────────────────────
  // 1) Filtering (index map to preserve original row indices)
  // ─────────────────────────────────────────────────────────────
  const filteredIndices = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matchStatus = (row) => statusFilter === 'all' || row.status === statusFilter
    return rows.reduce((acc, row, idx) => {
      const matchText =
        !q ||
        row.pnr.toLowerCase().includes(q) ||
        (row.stage.toLowerCase().includes(q))
      if (matchText && matchStatus(row)) acc.push(idx)
      return acc
    }, [])
  }, [rows, search, statusFilter])

  const filtered = useMemo(() => filteredIndices.map(i => rows[i]), [rows, filteredIndices])

  // ─────────────────────────────────────────────────────────────
  // 2) Pagination state
  // ─────────────────────────────────────────────────────────────
  const [pageSize, setPageSize] = useState(10)  // options: 10, 20, 50
  const [page, setPage] = useState(1)

  // Reset to page 1 when filters/search/rows/pageSize change
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, rows, pageSize])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const clampedPage = Math.min(page, pageCount)

  const start = (clampedPage - 1) * pageSize
  const end = start + pageSize
  const pageRows = filtered.slice(start, end)

  // Show "X–Y of Z"
  const total = filtered.length
  const from = total === 0 ? 0 : start + 1
  const to = Math.min(total, end)

  // Page number buttons (max 5 visible)
  const pageNumbers = useMemo(() => {
    const maxButtons = 5
    let startPage = Math.max(1, clampedPage - Math.floor(maxButtons / 2))
    let endPage = Math.min(pageCount, startPage + maxButtons - 1)
    startPage = Math.max(1, endPage - maxButtons + 1)
    // return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)
    return [1,2,3]
  }, [clampedPage, pageCount])

  // ─────────────────────────────────────────────────────────────
  // 3) Actions (map view index → original index using filteredIndices)
  // ─────────────────────────────────────────────────────────────
  function handleKill(viewIndexOnPage, e) {
    e.stopPropagation()
    const globalViewIndex = start + viewIndexOnPage
    const originalIndex = filteredIndices[globalViewIndex]
    if (originalIndex == null) return
    onKill?.(originalIndex)
  }

  function handleRetry(viewIndexOnPage, e) {
    e.stopPropagation()
    // TODO: wire a real onRetry callback if needed (pattern same as onKill)
    // const globalViewIndex = start + viewIndexOnPage
    // const originalIndex = filteredIndices[globalViewIndex]
    // onRetry?.(originalIndex)
  }

  return (
    <div className="card mb-8">
      {/* Header: search */}
      <div className="p-3 border-b border-black/10 flex items-center justify-between gap-2">
        <div className="relative w-full m-1">
          <input
            className="input w-full pl-9"
            placeholder="Search by PNR or Stage"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search PNR or Stage"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
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
              const isKilling = killingSet.has(row.pnr)
              const isRetrying = retryingSet.has(row.pnr)
              return (
                <tr
                  key={row.pnr}
                  onClick={() => onSelect(row)}
                  className={`cursor-pointer hover:bg-black/5 ${
                    selected?.pnr === row.pnr ? 'ring-1 ring-brand-red/60 bg-red-50' : ''
                  }`}
                >
                  <td className="font-mono font-semibold text-brand-red">{row.pnr}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="text-black/80">{row.stage}</td>
                  <td className="text-black/80">{formatDate("03/02/2026 13:50:20")}</td>
                  <td className="text-black/80">{formatDate("03/02/2026 12:43:19")}</td>
                  <td className="text-black/80 w-1/4">
                    <p>
                      {row.status === 'error' ? (
                        <Tooltip
                          position="top"
                          content={
                            <ul className="list-disc pl-4">
                              <li className='text-[12px] mt-1'>Error suggestions:</li>
                              <li className='text-[12px] mt-1'>Verify RFIC/RFISC mapping</li>
                              <li className='text-[12px] mt-1'>Fix missing or invalid tour/corporate code</li>
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
                    {row.status === 'error' ? (
                      <>
                        <button
                          className="btn btn-secondary h-8 p-2 mr-2"
                          title="Retry process"
                          onClick={(e) => handleRetry(viewIdx, e)}
                          disabled={isRetrying || isKilling}
                        >
                          {isRetrying ? <Spinner /> : 'Retry'}
                        </button>
                        <button
                          className="btn btn-primary h-8 mt-2"
                          title="Kill process"
                          onClick={(e) => handleKill(viewIdx, e)}
                          disabled={isKilling || isRetrying}
                        >
                          {isKilling ? <Spinner /> : <i className="fa-solid fa-xmark"></i>}
                        </button>
                      </>
                    ) : (
                      row.action ?? 'NA'
                    )}
                  </td>
                </tr>
              )
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-black/60">No matches</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: Show dropdown + summary + pagination */}
      <div className="p-2 border-t border-black/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Show dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="pageSize" className="text-xs text-black/70">Show</label>
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
          Showing <span className="font-medium">{from}</span>–<span className="font-medium">{to}</span> of{' '}
          <span className="font-medium">{total}</span> entries
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-1">
          <button
            className="btn h-9 px-3 text-xs"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={clampedPage <= 1 || total === 0}
            aria-label="Previous page"
          >
            Prev
          </button>

          {pageNumbers.map((p) => (
            <button
              key={p}
              className={`btn h-9 px-3 ${p === clampedPage ? 'btn-secondary' : ''}`}
              aria-current={p === clampedPage ? 'page' : undefined}
              onClick={() => setPage(p)}
              disabled={total === 0}
            >
              {p}
            </button>
          ))}

          <button
            className="btn h-9 px-3 text-xs"
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            disabled={clampedPage >= pageCount || total === 0}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}