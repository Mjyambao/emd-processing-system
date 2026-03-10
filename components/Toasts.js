/**
 * Uniform toast system — supports corner positioning, icons-only (Font Awesome), compact.
 * props:
 *  - items: [{ id, variant: 'success'|'error'|'warning'|'info', ariaLabel, title, startTimer, stopTimer }]
 *  - onClose: (id) => void
 *  - position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' (default: 'bottom-right')
 */
export default function Toasts({
  items = [],
  onClose,
  position = "bottom-right",
}) {
  const iconClass = (variant) => {
    switch (variant) {
      case "success":
        return "fa-regular fa-circle-check";
      case "error":
        return "fa-regular fa-circle-xmark";
      case "warning":
        return "fa-solid fa-triangle-exclamation";
      default:
        return "fa-regular fa-circle-info";
    }
  };

  const bgClass = (variant) => {
    switch (variant) {
      case "success":
        return "bg-green-600";
      case "error":
        return "bg-red-600";
      case "warning":
        return "bg-amber-600";
      default:
        return "bg-slate-700";
    }
  };

  const posClass = (() => {
    switch (position) {
      case "top-right":
        return "top-2 right-2";
      case "top-left":
        return "top-2 left-2";
      case "bottom-left":
        return "bottom-2 left-2";
      case "bottom-right":
      default:
        return "bottom-2 right-2";
    }
  })();

  // For bottom positions, render newest near the corner by reversing the list.
  const renderItems = position.includes("bottom")
    ? [...items].reverse()
    : items;

  return (
    <div
      className={`toast-container fixed ${posClass} z-[60] space-y-2 w-[90vw] max-w-[340px]`}
    >
      {renderItems.map((toast) => (
        <button
          key={toast.id}
          className={`toast-item ${bgClass(toast.variant)} text-white shadow-md`}
          onClick={() => onClose(toast.id)}
          onMouseEnter={() => toast.stopTimer?.()}
          onMouseLeave={() => toast.startTimer?.()}
          title={toast.title || toast.ariaLabel || "Notification"}
          aria-label={toast.ariaLabel || toast.title || "Notification"}
          type="button"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            animation: "toastIn 220ms ease-out forwards",
          }}
        >
          <i className={iconClass(toast.variant)} aria-hidden="true"></i>
          <span className="sr-only">{toast.ariaLabel || toast.title}</span>
        </button>
      ))}
    </div>
  );
}
