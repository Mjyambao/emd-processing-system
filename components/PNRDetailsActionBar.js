// components/PNRDetailsActionBar.js
import { useMemo, useState } from "react";

export default function PNRDetailsActionBar({
  errorDetails, // string e.g., 'error' | 'processing' | ...
  onRetry, // () => Promise|void
  onRemoveFromQueue, // () => Promise|void
  onSendToQueue, // ({ queueType: 'main'|'personal', assigneeName?: string }) => Promise|void
}) {
  const [open, setOpen] = useState(false);
  const [oasisOpen, setOasisOpen] = useState(false);

  const names = useMemo(
    () => ["Susan Wan Chen", "Boden Woolstencroft", "Matt Quiin"],
    [],
  );

  return (
    <div className="flex items-center gap-2">
      <div className="text-sm">
        <span className="text-black/60 mr-2">Error Details:</span>
        <strong className="font-semibold">{errorDetails}</strong>
      </div>

      <div>
        <button
          type="button"
          className="btn btn-secondary h-8"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Actions{" "}
          <i className={`fa-solid fa-chevron-${open ? "up" : "down"} ml-1`} />
        </button>

        {open && (
          <div className="absolute right-0 mt-1 w-[220px] bg-white border border-black/10 rounded shadow-lg z-[120]">
            <button
              className="w-full text-left px-3 py-2 hover:bg-black/5 text-sm"
              onClick={() => {
                setOpen(false);
                onRetry?.();
              }}
            >
              Retry
            </button>

            <button
              className="w-full text-left px-3 py-2 hover:bg-black/5 text-sm"
              onClick={() => {
                setOpen(false);
                setOasisOpen(true);
              }}
            >
              Send to Oasis Queue
            </button>

            <button
              className="w-full text-left px-3 py-2 hover:bg-black/5 text-sm text-red-600"
              onClick={() => {
                setOpen(false);
                onRemoveFromQueue?.();
              }}
            >
              Remove from Queue
            </button>
          </div>
        )}
      </div>

      <OasisQueueModal
        open={oasisOpen}
        onClose={() => setOasisOpen(false)}
        names={names}
        onSubmit={(payload) => {
          setOasisOpen(false);
          onSendToQueue?.(payload);
        }}
      />
    </div>
  );
}

function OasisQueueModal({ open, onClose, names = [], onSubmit }) {
  const [queueType, setQueueType] = useState("main"); // 'main' | 'personal'
  const [selected, setSelected] = useState("");

  const canSubmit =
    queueType === "main" || (queueType === "personal" && selected);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white w-[460px] max-w-[92vw] rounded shadow-lg border border-black/10">
        <div className="p-4 border-b border-black/10 flex items-center justify-between">
          <h3 className="text-base font-semibold">Send to Oasis Queue</h3>
          <button
            className="text-black/60 hover:text-black"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="oasis-queue"
                value="main"
                checked={queueType === "main"}
                onChange={() => setQueueType("main")}
              />
              <span>Main queue</span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="oasis-queue"
                value="personal"
                checked={queueType === "personal"}
                onChange={() => setQueueType("personal")}
              />
              <span>Personal queue</span>
            </label>

            {queueType === "personal" && (
              <div className="mt-2">
                <label className="text-xs text-black/60 mb-1 block">
                  Ticketer
                </label>
                <SingleSelectWithSearch
                  options={names}
                  placeholder="Search and select a name…"
                  value={selected}
                  onChange={setSelected}
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-black/10 flex items-center justify-end gap-2">
          <button className="btn h-9" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary h-9 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit?.({
                queueType,
                assigneeName: queueType === "personal" ? selected : undefined,
              })
            }
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

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
