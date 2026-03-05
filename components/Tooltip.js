import { useId, useState, useEffect, useRef } from 'react'

export default function Tooltip({
  children,
  content,
  closeMode = 'hover',
  position = 'top',
  delay = 120,
  className = ''
}) {
  const [open, setOpen] = useState(false)
  const [timer, setTimer] = useState(null)
  const id = useId()
  const rootRef = useRef(null)

  function show() {
    clearTimeout(timer)
    setTimer(setTimeout(() => setOpen(true), delay))
  }
  function hide() {
    if (closeMode === 'manual') return // do not hide on mouseout
    clearTimeout(timer)
    setTimer(setTimeout(() => setOpen(false), 100))
  }

  // Close on outside click or Escape (manual mode)
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    function onClick(e) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Positioning styles
  const pos = {
    top:    'bottom-full left-1/2 -translate-x-1/2 -translate-y-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 translate-y-2',
    left:   'right-full top-1/2 -translate-y-1/2 -translate-x-2',
    right:  'left-full top-1/2 -translate-y-1/2 translate-x-2',
  }[position] || 'bottom-full left-1/2 -translate-x-1/2 -translate-y-2'

  // Arrow styles by side
  const arrowBySide = {
    top:    'top-full left-1/2 -translate-x-1/2 border-t-black/0 border-r-black/0 border-l-black/0 border-b-black/10',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-black/0 border-r-black/0 border-l-black/0 border-t-black/10',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-black/0 border-t-black/0 border-b-black/0 border-r-black/10',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-black/0 border-t-black/0 border-b-black/0 border-l-black/10',
  }[position] || 'top-full left-1/2 -translate-x-1/2 border-b-black/10'

  return (
    <span
      ref={rootRef}
      className="relative inline-flex items-center"
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {/* Trigger element (e.g., an icon). The consumer provides it as children */}
      {children}

      {/* Bubble */}
      <span
        role="tooltip"
        id={id}
        aria-hidden={!open}
        className={[
          'pointer-events-auto absolute z-50',
          'whitespace-nowrap rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black shadow',
          'transition-opacity duration-100',
          open ? 'opacity-100' : 'opacity-0',
          pos,
          className
        ].join(' ')}
      >
        {content}

        {/* Arrow */}
        <span
          aria-hidden="true"
          className={[
            'absolute h-0 w-0 border-8',
            arrowBySide
          ].join(' ')}
        />
      </span>
    </span>
  )
}