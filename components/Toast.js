// components/Toast.js
import { useEffect } from 'react'

export default function ToastStack({ toasts, onDismiss }) {
  useEffect(() => {
    const timers = toasts.map(t =>
      setTimeout(() => onDismiss(t.id), t.duration ?? 2500)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, onDismiss])

  return (
    <div className="fixed bottom-4 right-4 z-[9999] space-y-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={[
            'flex items-start gap-2 rounded-md px-3 py-2 shadow text-sm border',
            t.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            t.type === 'error'   ? 'bg-red-50   border-red-200   text-red-800'   :
                                   'bg-black/80 border-black/20 text-white'
          ].join(' ')}
          role="status"
          aria-live="polite"
        >
          <i className={[
            'mt-0.5',
            t.type === 'success' ? 'fa-solid fa-circle-check text-green-600' :
            t.type === 'error'   ? 'fa-solid fa-circle-xmark text-red-600' :
                                   'fa-solid fa-circle-info text-white/90'
          ].join(' ')} />
          <div className="pr-6">{t.message}</div>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-auto text-black/50 hover:text-black/80"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      ))}
    </div>
  )
}