function Chip({ label, onClick, active, color = 'slate' }) {
  const colorMap = {
    slate:  'border-slate-300 text-slate-700 hover:bg-slate-50',
    green:  'border-green-300 text-green-700 hover:bg-green-50',
    yellow: 'border-yellow-300 text-yellow-700 hover:bg-yellow-50',
    red:    'border-red-300 text-red-700 hover:bg-red-50',
    gray:   'border-gray-300 text-gray-700 hover:bg-gray-50',
  }
  const activeMap = {
    slate:  'bg-slate-100',
    green:  'bg-green-100',
    yellow: 'bg-yellow-100',
    red:    'bg-red-100',
    gray:   'bg-gray-100',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'badge border transition-colors',
        colorMap[color] || colorMap.slate,
        active ? (activeMap[color] || activeMap.slate) : ''
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export default Chip