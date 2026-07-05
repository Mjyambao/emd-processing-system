import Spinner from "./Spinner";

function TTLModal({ open, dateStr, saving, onCancel, onDateChange, onSave }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[98] flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={saving ? undefined : onCancel}
      />
      <div className="relative z-[99] w-[360px] bg-white rounded-lg shadow-xl border border-black/10 p-4">
        <h3 className="text-base font-semibold mb-2">
          Set Ticket Time Limit (TTL)
        </h3>

        <div className="mb-4">
          <label className="block text-sm text-black/70 mb-1">TTL Date</label>
          <input
            type="date"
            className="input h-9 w-full"
            value={dateStr || ""}
            onChange={(e) => onDateChange?.(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button className="btn h-9" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary h-9 inline-flex items-center gap-2 disabled:opacity-60"
            onClick={onSave}
            disabled={saving}
          >
            {saving && <Spinner size={16} />}
            <span>Save TTL</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default TTLModal;
