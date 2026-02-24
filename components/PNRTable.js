import { useMemo } from 'react'
import StatusBadge from './StatusBadge'

export default function PNRTable({ rows, search, setSearch, onRefresh, onSelect, selected }) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.pnr.toLowerCase().includes(q) || r.passenger.toLowerCase().includes(q))
  }, [rows, search])

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
        <button onClick={onRefresh} className="btn btn-primary" title="Refresh all EMDs & statuses"><i className="fa-solid fa-rotate"></i> Refresh</button>
      </div>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>PNR</th>
              <th>Passenger Name</th>
              <th>Status</th>
              <th>Action Required</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.pnr}
                  onClick={() => onSelect(row)}
                  className={`cursor-pointer hover:bg-black/5 ${selected?.pnr === row.pnr ? 'ring-1 ring-brand-red/60 bg-red-50' : ''}`}>
                <td className="font-mono font-semibold text-brand-red">{row.pnr}</td>
                <td>{row.passenger}</td>
                <td><StatusBadge status={row.status} /></td>
                <td className="text-black/80">{row.status === 'processed' ? 'NA' : row.action}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-6 text-black/60">No matches</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}