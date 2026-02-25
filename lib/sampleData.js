export const initialPnrs = [
  { pnr: 'GLEBNY', passenger: 'John W Smith', status: 'processed', action: '-', stage: 'Invoicing', error: '-', source: 'sabre' },
  { pnr: 'NIEBNY', passenger: 'Jane D Cooper', status: 'processing', action: 'Verify EMD association with coupon 1', stage: 'EMD Mask Checking', error: '-'},
  { pnr: 'X1Y2Z3', passenger: 'Carlos Reyes', status: 'error', action: 'Error description: Failed during deal matching', stage: 'Deal Matching', error: 'Failed during deal matching.' },
  { pnr: 'AB12CD', passenger: 'Maria Santos', status: 'human', action: 'Review RFIC/RFISC for EMD-S before approval', stage: 'EMD Mask Checking', error: '-'},
  { pnr: 'PNR445', passenger: 'Akira Tanaka', status: 'processed', action: '-', stage: 'Invoicing', error: '-' },
  { pnr: 'PNR123', passenger: 'Matthew James', status: 'processing', action: '-', stage: 'Issue EMD', error: '-' },
]

export function refreshStatuses(list) {
  const states = ['processed','processing','error','human']
  return list.map(row => ({ ...row, status: states[Math.floor(Math.random()*states.length)], action: row.status === 'processed' ? 'NA' : row.action }))
}