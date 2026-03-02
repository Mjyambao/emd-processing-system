function Field({ k, v }) {
  return (
    <div className="bg-black/5 border border-black/10 rounded-lg p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm uppercase font-medium text-black/30">{k}</div>
      </div>
      <div className="mt-3 font-medium">{v}</div>
    </div>
  )
}

export default Field