import { useEffect, useMemo, useState } from "react";

function AssignModal({
  open,
  onClose,
  assignees = [],
  selectedCount = 0,
  onConfirm,
}) {
  const ALL_VALUE = "__ALL__";

  const [distributeEvenly, setDistributeEvenly] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState("");

  // Reset local selection each time the modal opens
  useEffect(() => {
    if (open) {
      setDistributeEvenly(false);
      setSelectedIds([]);
      setQuery("");
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Filter the visible assignees based on the query (case-insensitive)
  const filteredAssignees = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assignees;
    return assignees.filter((a) => a.name.toLowerCase().includes(q));
  }, [assignees, query]);

  // Compute resolved IDs (either all assignees if distributeEvenly, or selected ones)
  const resolvedIds = distributeEvenly
    ? assignees.map((a) => a.id)
    : selectedIds;

  // Keep your original distribution behavior & preview
  const distribution = useMemo(
    () => computeDistribution(selectedCount, resolvedIds),
    [selectedCount, resolvedIds],
  );

  const canConfirm =
    selectedCount > 0 && (distributeEvenly || resolvedIds.length > 0);

  const handleSelectChange = (e) => {
    const visibleOptionValues = new Set([
      ALL_VALUE,
      ...filteredAssignees.map((a) => String(a.id)),
    ]);

    // Values the user marked as selected in the currently visible <select> options
    const visibleSelectedValues = new Set(
      Array.from(e.target.selectedOptions).map((o) => o.value),
    );

    // Handle All-value behavior (even distribution)
    if (visibleSelectedValues.has(ALL_VALUE)) {
      setDistributeEvenly(true);
      setSelectedIds(assignees.map((a) => a.id));
      return;
    }

    // Otherwise we are in "selected" mode
    setDistributeEvenly(false);

    setSelectedIds((prev) => {
      const prevSet = new Set(prev);

      for (const val of visibleOptionValues) {
        if (val === ALL_VALUE) continue;
        const wasSelected = prevSet.has(val);
        const isSelectedNow = visibleSelectedValues.has(val);
        if (wasSelected && !isSelectedNow) {
          prevSet.delete(val);
        }
      }

      for (const val of visibleSelectedValues) {
        if (val === ALL_VALUE) continue;
        prevSet.add(val);
      }

      return Array.from(prevSet);
    });
  };

  const selectValue = distributeEvenly ? [ALL_VALUE] : selectedIds;

  const handleConfirm = () => {
    const payload = {
      mode: distributeEvenly ? "all" : "selected",
      selectedAssigneeIds: resolvedIds,
      distribution,
    };
    onConfirm?.(payload);
  };

  // Early return AFTER all hooks have been called
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[99] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="assign-modal-title"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-black/10 flex items-center justify-between">
          <h2 id="assign-modal-title" className="text-base font-semibold">
            Assign {selectedCount} {selectedCount === 1 ? "PNR" : "PNRs"}
          </h2>
          <button
            className="btn h-8 px-2"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-2">
          <label htmlFor="assignee-search" className="block text-sm">
            Search names
          </label>
          <input
            id="assignee-search"
            className="input w-full h-9 text-sm"
            placeholder="Type to filter assignees…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="flex items-center justify-between">
            <label htmlFor="assignee" className="block text-sm">
              Assign to
            </label>
            <span className="text-xs text-black/50">
              Showing {filteredAssignees.length} of {assignees.length}
            </span>
          </div>

          <select
            id="assignee"
            className="input w-full"
            multiple
            size={Math.min(8, (filteredAssignees.length || 0) + 1)}
            value={selectValue}
            onChange={handleSelectChange}
            aria-describedby="assignee-help"
          >
            <option value={ALL_VALUE}>All Ticketers — evenly distribute</option>
            {filteredAssignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <p id="assignee-help" className="text-xs text-black/60">
            {distributeEvenly ? (
              <>
                <strong>Even distribution</strong> is enabled. The{" "}
                {selectedCount} selected PNR
                {selectedCount === 1 ? "" : "s"} will be assigned round‑robin to
                all ticketers.
              </>
            ) : (
              <>
                Tip: Hold <kbd className="px-1 border rounded">Ctrl/Cmd</kbd> or{" "}
                <kbd className="px-1 border rounded">Shift</kbd> to select
                multiple names.
              </>
            )}
          </p>

          {/* Distribution preview */}
          {resolvedIds.length > 0 && selectedCount > 0 && (
            <div className="mt-2 rounded border border-black/10 bg-black/5 p-2">
              <p className="text-xs font-medium mb-1">Preview:</p>
              <ul className="text-xs list-disc pl-5 space-y-0.5">
                {resolvedIds.map((id) => {
                  const a = assignees.find((x) => x.id === id);
                  const count = distribution.perAssignee[id] || 0;
                  return (
                    <li key={id}>
                      {a?.name ?? id}:{" "}
                      <span className="font-semibold">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-black/10 flex items-center justify-end gap-2">
          <button className="btn h-9" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary h-9"
            onClick={handleConfirm}
            disabled={!canConfirm}
            title="Confirm assignment"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function computeDistribution(total, assigneeIds) {
  const ids = Array.isArray(assigneeIds) ? assigneeIds.filter(Boolean) : [];
  const n = ids.length;
  if (total <= 0 || n === 0) {
    return { perAssignee: {}, order: [] };
  }

  const base = Math.floor(total / n);
  const remainder = total % n;

  const perAssignee = {};
  ids.forEach((id, i) => {
    perAssignee[id] = base + (i < remainder ? 1 : 0);
  });

  // Round-robin order for deterministic assignment at index level
  const order = Array.from({ length: total }, (_, i) => ids[i % n]);

  return { perAssignee, order };
}

export default AssignModal;
