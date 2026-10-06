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
  onSkip?: () => void
}

/**
 * Collapsible, muted thinking text: open while it streams, folded once the answer starts.
 * If the loop guard cut it short it stays open, so you can see where it went wrong.
 */
function Thinking({ text, active, thoughtMs, tokens, stopped, onSkip }: ThinkingProps) {
  const [open, setOpen] = useState(active)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    setOpen(active || !!stopped)
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

  // The thread scrolls to the end when a chunk arrives; the reveal runs a few frames
  // behind, so keep following it while the reader is still near the bottom.
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const thread = ref.current?.closest('.thread')
    if (partial && thread && thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160) {
      thread.scrollTop = thread.scrollHeight
    }
  }, [shown, partial])

  return (
    <div ref={ref} className="markdown">
      <Markdown>{partial ? closePartial(shown) : shown}</Markdown>
    </div>
  )
}

export function Message({ message, onSkipThinking }: { message: UIMessage; onSkipThinking?: () => void }) {
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
