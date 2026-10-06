import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Clock, Copy, FileText, Wrench, type LucideIcon } from 'lucide-react'
import Markdown from 'react-markdown'
import { copyText } from '../clipboard'
import type { GuardReason } from '../loopGuard'
import { closePartial } from '../markdown'
import { describeCall } from '../tools'
import type { UIMessage } from '../useChat'
import { useSmoothText } from '../useSmoothText'
import { Icon } from './Icon'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** One icon per tool, on its call line and its result pill. */
const TOOL_ICON: Record<string, LucideIcon> = { read_file: FileText, get_time: Clock }
const toolIcon = (name?: string) => (name && TOOL_ICON[name]) || Wrench

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
          <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
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

/** Copies a reply's raw markdown; the icon turns into a check for a moment. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const label = copied ? 'Copied' : 'Copy reply'
  return (
    <>
      <button
        type="button"
        className="ghost icon-only"
        aria-label={label}
        title={label}
        onClick={() => void copyText(text).then((ok) => ok && setCopied(true))}
      >
        <Icon icon={copied ? Check : Copy} size="sm" />
      </button>
      <span className="sr-only" role="status">
        {copied ? 'Copied' : ''}
      </span>
    </>
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
        <summary>
          <Icon icon={toolIcon(message.tool_name)} size="sm" />
          {message.tool_name} returned
          <Icon icon={ChevronRight} size="sm" className="when-closed" />
          <Icon icon={ChevronDown} size="sm" className="when-open" />
        </summary>
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
          <Icon icon={toolIcon(call.function.name)} size="sm" />
          <span>
            Called <code>{describeCall(call)}</code>
          </span>
        </div>
      ))}
      {message.content && <Answer text={message.content} live={!!message.live} />}
      {message.content && !message.live && (
        <div className="msg-actions">
          <CopyButton text={message.content} />
        </div>
      )}
    </div>
  )
}
