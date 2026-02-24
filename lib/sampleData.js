export const initialPnrs = [
  { pnr: 'GLEBNY', passenger: 'John W Smith', status: 'processed', action: 'NA', source: 'sabre' },
  { pnr: 'NIEBNY', passenger: 'Jane D Cooper', status: 'processing', action: 'Verify EMD association with coupon 1' },
  { pnr: 'X1Y2Z3', passenger: 'Carlos Reyes', status: 'error', action: 'Retry EMD issuance (RFISC 05Z) and reprice' },
  { pnr: 'AB12CD', passenger: 'Maria Santos', status: 'human', action: 'Review RFIC/RFISC for EMD-S before approval' },
  { pnr: 'PNR445', passenger: 'Akira Tanaka', status: 'processed', action: 'NA' },
]

export function refreshStatuses(list) {
  const states = ['processed','processing','error','human']
  return list.map(row => ({ ...row, status: states[Math.floor(Math.random()*states.length)], action: row.status === 'processed' ? 'NA' : row.action }))
}