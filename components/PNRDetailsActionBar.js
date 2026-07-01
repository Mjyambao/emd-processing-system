import { useMemo, useState } from "react";
import SingleSelectWithSearch from "./SingleSelectWithSearch";

export default function PNRDetailsActionBar({
  errorDetails,
  onRetry,
  onRemoveFromQueue,
  onSendToQueue,

  // Parent handler that opens the confirmation modal in PNRDetails
  onErrorActionSelect,

  detailsLabel = "Error Details",
  actionLabel = "Action",
  actionButtonLabel = "Select Action",
  disableActions = false,
  blockedActionText = "Actions are not available for this status.",
  isHumanRequired = false,
}) {
  const [open, setOpen] = useState(false);
  const [oasisOpen, setOasisOpen] = useState(false);

  const names = useMemo(() => ["Ticketer 1", "Guest User", "Matt Quiin"], []);

  const triggerAction = (action) => {
    if (!action) return;
    onErrorActionSelect?.(action);
  };

  return (
    <div>
      {!isHumanRequired ? (
        <div className="text-sm w-[250px] mb-2">
          <span className="text-black/60 mr-1">{detailsLabel}:</span>
          <strong className="font-semibold">
            {errorDetails !== "" ? errorDetails : "-"}
          </strong>
        </div>
      ) : (
        ""
      )}

      <div className="relative">
        <span className="text-black/60 mr-2">{actionLabel}:</span>
        <button
          type="button"
          className="btn btn-secondary h-8 w-[140px] text-black/50 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={() => !disableActions && setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={!disableActions && open}
          disabled={disableActions}
          title={disableActions ? blockedActionText : actionButtonLabel}
        >
          {disableActions ? "Blocked" : actionButtonLabel}
          <i
            className={`fa-solid fa-chevron-${
              open && !disableActions ? "up" : "down"
            } ml-4`}
          />
        </button>

        {disableActions && (
          <div className="text-xs text-black/50 mt-1">{blockedActionText}</div>
        )}

        {!disableActions && open && (
          <div className="absolute right-0 mt-1 w-[220px] bg-white border border-black/10 rounded shadow-lg z-[120]">
            <button
              className={`w-full text-left px-3 py-2 hover:bg-black/5 text-sm ${isHumanRequired ? "hidden" : ""}`}
              onClick={() => {
                setOpen(false);

                // Pass exact payload string expected by postQueueAction
                triggerAction("Retry");
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

                // Pass exact payload string expected by postQueueAction
                triggerAction("RemoveFromQueue");
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

          // Keep prop callable for compatibility if needed elsewhere
          onSendToQueue?.(payload);

          // IMPORTANT:
          // This opens the parent confirmation modal,
          // and the parent should then call:
          // postQueueAction(pnrId, { action: "SendToOasis" })
          triggerAction("SendToOasis");
        }}
      />
    </div>
  );
}

function OasisQueueModal({ open, onClose, names = [], onSubmit }) {
  const [queueType, setQueueType] = useState("main");
  const [selected, setSelected] = useState("");

  const canSubmit = queueType === "main";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white w-[320px] max-w-[92vw] rounded shadow-lg border border-black/10">
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
          <div className="flex flex-col gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="oasis-queue"
                value="main"
                checked={queueType === "main"}
                onChange={() => setQueueType("main")}
              />
              <span>Main Queue</span>
            </label>

            {/* Disabled + blurred personal queue */}
            <label className="inline-flex items-center gap-2 text-sm opacity-50 blur-[0.4px] cursor-not-allowed select-none">
              <input
                type="radio"
                name="oasis-queue"
                value="personal"
                checked={queueType === "personal"}
                onChange={() => {}}
                disabled
              />
              <span>Personal Queue</span>
              <span className="text-[11px] text-black/50">(Coming soon)</span>
            </label>

            {queueType === "personal" && (
              <div className="mt-2 pointer-events-none opacity-50 blur-[0.4px]">
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
                queueType: "main",
                assigneeName: undefined,
              })
            }
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
