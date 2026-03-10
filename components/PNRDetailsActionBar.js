import { useMemo, useState } from "react";
import SingleSelectWithSearch from "./SingleSelectWithSearch";

export default function PNRDetailsActionBar({
  errorDetails,
  onRetry,
  onRemoveFromQueue,
  onSendToQueue,
}) {
  const [open, setOpen] = useState(false);
  const [oasisOpen, setOasisOpen] = useState(false);

  const names = useMemo(
    () => ["Susan Wan Chen", "Boden Woolstencroft", "Matt Quiin"],
    [],
  );

  return (
    <div>
      <div className="text-sm w-[250px] mb-2">
        <span className="text-black/60 mr-1">Error Details:</span>
        <strong className="font-semibold">{errorDetails}</strong>
      </div>

      <div>
        <span className="text-black/60 mr-2">Action:</span>
        <button
          type="button"
          className="btn btn-secondary h-8 w-[140px] text-black/50"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Select Action
          <i className={`fa-solid fa-chevron-${open ? "up" : "down"} ml-4`} />
        </button>

        {open && (
          <div className="absolute right-25 w-[220px] bg-white border border-black/10 rounded shadow-lg z-[120]">
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
    <div className="fixed inset-0 z-[200] flex items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white w-[300px] max-w-[92vw] rounded shadow-lg border border-black/10">
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
