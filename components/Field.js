function Field({ k, v }) {
  return (
    <div className="bg-black/5 border border-black/10 rounded p-3">
      <div className="flex items-center gap-1">
        <div className="text-xs uppercase text-black/50">{k}</div>
      </div>
      <div className="mt-1 font-medium">{v}</div>
    </div>
  )
}

export default Field