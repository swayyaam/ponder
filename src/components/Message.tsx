import { useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { closePartial } from '../markdown'
import { describeCall } from '../tools'
import type { UIMessage } from '../useChat'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** Collapsible, muted thinking text: open while it streams, folded once the answer starts. */
function Thinking({ text, active, thoughtMs }: { text: string; active: boolean; thoughtMs?: number }) {
  const [open, setOpen] = useState(active)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    setOpen(active)
  }

  // While it streams, keep the newest line in view unless the reader scrolled up.
  const box = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  useLayoutEffect(() => {
    const el = box.current
    if (el && active && follow.current) el.scrollTop = el.scrollHeight
  }, [text, active, open])
  const onScroll = () => {
    const el = box.current
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const label = active ? 'Thinking…' : thoughtMs !== undefined ? `Thought for ${seconds(thoughtMs)}` : 'Thoughts'
  return (
    <div className="thinking">
      <button type="button" className="thinking-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div ref={box} className="thinking-text markdown" onScroll={onScroll}>
          <Markdown>{active ? closePartial(text) : text}</Markdown>
        </div>
      )}
    </div>
  )
}

export function Message({ message }: { message: UIMessage }) {
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
      {message.thinking && <Thinking text={message.thinking} active={thinkingNow} thoughtMs={message.thoughtMs} />}
      {message.tool_calls?.map((call, i) => (
        <div key={call.id ?? i} className="tool-call">
          Called <code>{describeCall(call)}</code>
        </div>
      ))}
      {message.content && (
        <div className="markdown">
          <Markdown>{message.content}</Markdown>
        </div>
      )}
    </div>
  )
}
