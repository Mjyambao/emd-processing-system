import { useMemo } from 'react'
import StatusBadge from './StatusBadge'
import Tooltip from '../components/Tooltip'

export default function PNRTable({
  rows,
  search,
  setSearch,
  onRefresh,
  onSelect,
  selected,
  onKill, 
}) {
  // Build an array of original indices that match the filter
  const filteredIndices = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.reduce((acc, row, idx) => {
      if (!q ||
          row.pnr.toLowerCase().includes(q) ||
          row.passenger?.toLowerCase().includes(q)) {
        acc.push(idx)
      }
      return acc
    }, [])
  }, [rows, search])

  // Convenience visible rows, derived from original rows using the map
  const filtered = useMemo(
    () => filteredIndices.map(i => rows[i]),
    [rows, filteredIndices]
  )

  // Helper: translate visible row (view index) to original index and kill
  const handleKill = (viewIndex, e) => {
    e.stopPropagation(); // prevent selecting the row

    const originalIndex = filteredIndices[viewIndex];
    if (originalIndex == null) return;

    const pnr = rows[originalIndex]?.pnr ?? 'this PNR';
    if (!confirm(`Kill process for ${pnr}? This will remove item in queue.`)) return;

    onKill?.(originalIndex);
  }

  const handleRetry = (viewIndex, e) => {
    e.stopPropagation();
  }

  return (
    <div className="card">
      <div className="p-3 border-b border-black/10 flex items-center justify-between gap-2">
        <div className="relative w-full m-1">
          <input
            className="input w-full pl-9"
            placeholder="Search by PNR or Passenger Name"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={()=>{location.reload();}} className="btn btn-primary" title="Refresh all EMDs & statuses">
          <i className="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="table overflow-hidden">
          <thead>
            <tr>
              <th>PNR</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Error Details</th>
              <th>Action Required</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, viewIdx) => (
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
                <td className="text-black/80 w-1/4">
                  <p>
                    {row.status === 'error' ? (
                      <>
                        <Tooltip
                          content={
                            <>
                              <span className='block text-[12px] mt-1'>{'Error suggestions:'}</span>
                              <span className='block text-[12px] mt-1'>{'- Verify RFIC/RFISC mapping'}</span>
                              <span className='block text-[12px] mt-1'>{'- Fix missing or invalid tour code/corporate code'}</span>
                            </>
                          }
                          position="top"
                        >
                          <button
                            type="button"
                            className="ml-1 mr-2 inline-flex h-4 w-4 items-center justify-center rounded text-black/50 hover:text-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                            aria-label={`More info about this error`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <i className="fa-solid fa-circle-info text-[14px]"></i>
                          </button>
                        </Tooltip>
                      </>
                    ) : null}
                    {row.error}
                  </p>
                </td>
                <td className="text-black/80">
                  {row.status === 'error' ? (
                    <>
                      <button
                        className="btn btn-secondary h-8 p-2 mr-1"
                        title="Retry process"
                        onClick={(e) => handleRetry(viewIdx, e)}
                      >
                        Retry
                      </button>
                      <button
                        className="btn btn-primary h-8 mt-2"
                        title="Kill process"
                        onClick={(e) => handleKill(viewIdx, e)}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </>
                  ) : (
                    row.action
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-6 text-black/60">No matches</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
