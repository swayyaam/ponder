import { useEffect, useState } from 'react'

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Frames to clear whatever is still hidden: a burst of tokens catches up in about a tenth of a second. */
const CATCH_UP_FRAMES = 6
/** Slowest pace, in characters per frame, so a steady stream never crawls. */
const MIN_STEP = 2

/**
 * Streamed text, revealed a few characters per frame so bursts of tokens read as an even flow.
 * The pace grows with the backlog, so it stays only a few frames behind the stream.
 * Text that was already complete when it mounted shows at once.
 */
export function useSmoothText(text: string, live: boolean): string {
  const [shown, setShown] = useState(live && !reducedMotion ? 0 : text.length)
  const behind = shown < text.length

  useEffect(() => {
    if (!behind) return
    const id = requestAnimationFrame(() =>
      setShown((n) =>
        reducedMotion ? text.length : Math.min(text.length, n + Math.max(MIN_STEP, Math.ceil((text.length - n) / CATCH_UP_FRAMES))),
      ),
    )
    return () => cancelAnimationFrame(id)
  }, [shown, text, behind])

  return behind ? text.slice(0, shown) : text
}
