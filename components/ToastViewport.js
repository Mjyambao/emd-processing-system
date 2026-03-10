function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`min-w-[260px] max-w-[360px] rounded-lg shadow-lg border px-3 py-2 text-sm flex items-start gap-2
            ${
              t.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : t.type === "info"
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
        >
          <span className="mt-[2px]">
            {t.type === "error" ? "⛔" : t.type === "info" ? "ℹ️" : "✅"}
          </span>
          <div className="flex-1">{t.message}</div>
          <button
            className="text-black/50 hover:text-black"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastViewport;
