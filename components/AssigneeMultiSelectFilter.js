import { useEffect, useMemo, useState } from "react";

function AssigneeMultiSelectFilter({
  options,
  selected,
  includeUnassigned,
  onCommit,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draftSelected, setDraftSelected] = useState(selected || []);
  const [draftUnassigned, setDraftUnassigned] = useState(!!includeUnassigned);

  // Reset draft when opening (or when committed values change while open)
  useEffect(() => {
    if (open) {
      setDraftSelected(Array.isArray(selected) ? selected : []);
      setDraftUnassigned(!!includeUnassigned);
      setQ("");
    }
  }, [open, selected, includeUnassigned]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((n) => n.toLowerCase().includes(s));
  }, [options, q]);

  const toggleName = (name) => {
    setDraftSelected((prev) => {
      const set = new Set(prev);
      if (set.has(name)) set.delete(name);
      else set.add(name);
      return Array.from(set);
    });
  };

  const labelText = (() => {
    const count = selected?.length || 0;
    if (draftUnassigned && count === 0) return "Unassigned";
    if (count > 0)
      return `${count} selected${includeUnassigned ? " + Unassigned" : ""}`;
    return includeUnassigned ? "Unassigned" : "All";
  })();

  return (
    <div className="relative">
      <button
        type="button"
        className="input h-8 text-xs w-full flex items-center justify-between"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by assignee(s)"
      >
        <span className="truncate">{labelText}</span>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"} ml-2`} />
      </button>

      {open && (
        <div className="absolute z-[95] mt-1 w-[260px] bg-white border border-black/10 rounded shadow-lg p-2">
          <div className="mb-2">
            <input
              className="input h-8 text-xs w-full"
              placeholder="Search names…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="max-h-[220px] overflow-y-auto pr-1">
            <label className="flex items-center gap-2 py-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={draftUnassigned}
                onChange={(e) => setDraftUnassigned(e.target.checked)}
              />
              <span>Unassigned</span>
            </label>

            <div className="my-1 border-t border-black/10" />

            {filtered.length === 0 ? (
              <div className="text-xs text-black/60 py-2 px-1">No matches</div>
            ) : (
              filtered.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 py-1 text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={draftSelected.includes(name)}
                    onChange={() => toggleName(name)}
                  />
                  <span className="truncate">{name}</span>
                </label>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/10">
            <button
              className="btn h-8 text-xs"
              onClick={() => {
                setDraftSelected([]);
                setDraftUnassigned(false);
                setQ("");
              }}
            >
              Clear
            </button>
            <div className="flex items-center gap-2">
              <button
                className="btn h-8 text-xs"
                onClick={() => setOpen(false)}
                title="Close"
              >
                Cancel
              </button>
              <button
                className="btn btn-secondary h-8 text-xs"
                onClick={() => {
                  onCommit?.({
                    selected: draftSelected,
                    includeUnassigned: draftUnassigned,
                  });
                  setOpen(false);
                }}
                title="Apply filter"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssigneeMultiSelectFilter;
