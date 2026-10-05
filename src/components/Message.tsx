import { useState } from 'react'
import Markdown from 'react-markdown'
import type { UIMessage } from '../useChat'

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** Collapsible, muted thinking text: open while it streams, folded once the answer starts. */
function Thinking({ text, active, thoughtMs }: { text: string; active: boolean; thoughtMs?: number }) {
  const [open, setOpen] = useState(active)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    setOpen(active)
  }

  const label = active ? 'Thinking…' : thoughtMs !== undefined ? `Thought for ${seconds(thoughtMs)}` : 'Thoughts'
  return (
    <div className="thinking">
      <button type="button" className="thinking-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <div className="thinking-text">{text}</div>}
    </div>
  )
}

export function Message({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    return <div className="msg user">{message.content}</div>
  }

  const thinkingNow = !!message.live && !message.content && !message.tool_calls
  return (
    <div className="msg assistant">
      {message.thinking && <Thinking text={message.thinking} active={thinkingNow} thoughtMs={message.thoughtMs} />}
      {message.content && (
        <div className="markdown">
          <Markdown>{message.content}</Markdown>
        </div>
      )}
    </div>
  )
}
