import { useId, useState } from 'react'

/**
 * Simple, accessible tooltip.
 * - Shows on hover and on keyboard focus (for the trigger).
 * - Positions: top | right | bottom | left (default: top).
 * - Optional delay to reduce flicker on brief hovers.
 *
 * Props:
 *  - content: ReactNode (tooltip text or JSX)
 *  - position: 'top' | 'right' | 'bottom' | 'left'
 *  - delay: number (ms) - show delay on hover/focus
 *  - className: extra classes for the tooltip bubble
 */
export default function Tooltip({
  children,
  content,
  position = 'top',
  delay = 120,
  className = ''
}) {
  const [open, setOpen] = useState(false)
  const [timer, setTimer] = useState(null)
  const id = useId()

  function show() {
    clearTimeout(timer)
    setTimer(setTimeout(() => setOpen(true), delay))
  }
  function hide() {
    clearTimeout(timer)
    setOpen(false)
  }

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
      className="relative inline-flex items-center"
      onMouseEnter={show}
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
          'pointer-events-none absolute z-50',
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