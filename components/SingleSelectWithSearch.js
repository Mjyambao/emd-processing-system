function SingleSelectWithSearch({
  options = [],
  value,
  onChange,
  placeholder = "Search…",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.toLowerCase().includes(s));
  }, [options, q]);

  const select = (name) => {
    onChange?.(name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="input h-9 w-full flex items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{value || "Select…"}</span>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"} ml-2`} />
      </button>

      {open && (
        <div className="absolute z-[95] mt-1 w-full bg-white border border-black/10 rounded shadow-lg p-2">
          <div className="mb-2">
            <input
              className="input h-9 w-full text-sm"
              placeholder={placeholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="max-h-[220px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-sm text-black/60 p-2">No matches</div>
            ) : (
              filtered.map((name) => (
                <button
                  key={name}
                  className="w-full text-left px-2 py-2 hover:bg-black/5 text-sm"
                  onClick={() => select(name)}
                >
                  {name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SingleSelectWithSearch;
