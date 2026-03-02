const map = {
  processed: { label: 'Processed', color: 'bg-green-500/20 text-green-700 border-green-500/40', icon: 'fa-solid fa-circle-check' },
  processing: { label: 'Processing', color: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/40', icon: 'fa-solid fa-spinner' },
  error: { label: 'Error on Processing', color: 'bg-red-500/20 text-red-700 border-red-500/40', icon: 'fa-solid fa-triangle-exclamation' },
  human: { label: 'Human Input Required', color: 'bg-gray-500/20 text-gray-700 border-gray-500/40', icon: 'fa-solid fa-user-pen' },
}

export default function StatusBadge({ status }) {
  const { label, color, icon } = map[status] || map['processing'];
  return (
    <span className={`inline-flex items-center gap-1 border rounded-md px-3 py-2 text-xs w-[180px] justify-center ${color}`}><i className={icon}></i> {label}</span>
  )
}