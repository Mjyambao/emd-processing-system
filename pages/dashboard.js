import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import TopNav from '../components/TopNav'
import PNRTable from '../components/PNRTable'
import PNRDetails from '../components/PNRDetails'
import { initialPnrs, refreshStatuses } from '../lib/sampleData'
import { requireAuth } from '../lib/auth'

export default function Dashboard(){
  const router = useRouter()
  const [pnrs, setPnrs] = useState(initialPnrs)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => { requireAuth(router) }, [])

  async function handleRefresh(){
    setIsRefreshing(true)
    await new Promise(r => setTimeout(r, 800))
    setPnrs(p => refreshStatuses(p))
    setIsRefreshing(false)
  }

  function handleLogout(){
    localStorage.removeItem('session')
    router.replace('/')
  }

  return (
    <div className="min-h-screen">
      <TopNav onLogout={handleLogout} />

      <main className="mx-auto max-w-6xl p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-black/70">
          <span><i className="fa-solid fa-table"></i> Dashboard</span>
          <span className="text-black/40">/</span>
          <span>EMDs & PNRs</span>
          {isRefreshing && <span className="ml-auto animate-pulse text-black/60"><i className="fa-solid fa-arrows-rotate"></i> Refreshing…</span>}
        </div>

        <PNRTable
          rows={pnrs}
          search={search}
          setSearch={setSearch}
          onRefresh={handleRefresh}
          onSelect={setSelected}
          selected={selected}
        />

        <PNRDetails selected={selected} onApprove={({pnr}) => {
          setPnrs(list => list.map(r => r.pnr === pnr ? { ...r, status: 'processed', action: 'NA' } : r))
        }} />
      </main>
    </div>
  )
}