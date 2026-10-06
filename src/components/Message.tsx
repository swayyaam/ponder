import { useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import type { GuardReason } from '../loopGuard'
import { closePartial } from '../markdown'
import { describeCall } from '../tools'
import type { UIMessage } from '../useChat'
import { useSmoothText } from '../useSmoothText'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

interface ThinkingProps {
  text: string
  active: boolean
  thoughtMs?: number
  tokens?: number
  stopped?: GuardReason
  /** Part of the latest turn. */
  current: boolean
  onSkip?: () => void
}

/**
 * Collapsible, muted thinking text. It opens while it streams and stays open while the answer
 * streams below it (folding it then would yank the answer up mid-read). It folds once the
 * next turn starts, when the thread scrolls to the new message anyway.
 */
function Thinking({ text, active, thoughtMs, tokens, stopped, current, onSkip }: ThinkingProps) {
  const [open, setOpen] = useState(active)
  const [wasCurrent, setWasCurrent] = useState(current)
  if (current !== wasCurrent) {
    setWasCurrent(current)
    if (!current) setOpen(false)
  }

  const shown = useSmoothText(text, active)
  const partial = active || shown.length < text.length

  // While it streams, keep the newest line in view unless the reader scrolled up.
  const box = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  useLayoutEffect(() => {
    const el = box.current
    if (el && partial && follow.current) el.scrollTop = el.scrollHeight
  }, [shown, partial, open])
  const onScroll = () => {
    const el = box.current
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const label = active ? 'Thinking…' : thoughtMs !== undefined ? `Thought for ${seconds(thoughtMs)}` : 'Thoughts'
  const meta = [tokens && `${tokens} tokens`, stopped && `stopped: ${stopped}`].filter(Boolean).join(' · ')
  return (
    <div className="thinking">
      <div className="thinking-head">
        <button type="button" className="thinking-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {label}
        </button>
        {meta && <span className={`thinking-meta ${stopped && stopped !== 'skipped' ? 'stopped' : ''}`}>{meta}</span>}
        {active && onSkip && (
          <button type="button" className="thinking-skip" onClick={onSkip}>
            Skip thinking
          </button>
        )}
      </div>
      {open && (
        <div ref={box} className="thinking-text markdown" onScroll={onScroll}>
          <Markdown>{partial ? closePartial(shown) : shown}</Markdown>
        </div>
      )}
    </div>
  )
}

/** The answer, revealed smoothly while it streams. */
function Answer({ text, live }: { text: string; live: boolean }) {
  const shown = useSmoothText(text, live)
  const partial = live || shown.length < text.length

  return (
    <div className="markdown">
      <Markdown>{partial ? closePartial(shown) : shown}</Markdown>
    </div>
  )
}

interface MessageProps {
  message: UIMessage
  /** Part of the latest turn (after the last user message). */
  current?: boolean
  onSkipThinking?: () => void
}

export function Message({ message, current = false, onSkipThinking }: MessageProps) {
  if (message.role === 'user') {
    return <div className="msg user">{message.content}</div>
  }

  if (message.role === 'tool') {
    return (
      <details className="msg tool-result">
        <summary>{message.tool_name} returned</summary>
        <pre>{message.content}</pre>
      </details>
    )
  }

  const thinkingNow = !!message.live && !message.content && !message.tool_calls
  return (
    <div className="msg assistant">
      {message.thinking && (
        <Thinking
          text={message.thinking}
          active={thinkingNow}
          thoughtMs={message.thoughtMs}
          tokens={message.thinkingTokens}
          stopped={message.thinkingStopped}
          current={current}
          onSkip={onSkipThinking}
        />
      )}
      {message.tool_calls?.map((call, i) => (
        <div key={call.id ?? i} className="tool-call">
          Called <code>{describeCall(call)}</code>
        </div>
      ))}
      {message.content && <Answer text={message.content} live={!!message.live} />}
    </div>
  )
}
