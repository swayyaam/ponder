import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Orb } from '@yogesharc/thinking-orbs'
import { Brain, Cpu, Trash2, Wrench } from 'lucide-react'
import { ActivityPanel } from './components/ActivityPanel'
import { Icon } from './components/Icon'
import { Message } from './components/Message'
import { OrbStatus } from './components/OrbStatus'
import { describe, orbSize } from './orbs'
import { listModels, type ModelInfo } from './ollama'
import { useChat } from './useChat'
import './App.css'

const DEFAULT_MODEL = 'qwen3.5:2b-mlx'

export default function App() {
  const { items, busy, phase, activity, send, stop, skipThinking, clear } = useChat()
  const [models, setModels] = useState<ModelInfo[]>([])
  const [model, setModel] = useState('')
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [think, setThink] = useState(true)
  const [tools, setTools] = useState(true)
  const [input, setInput] = useState('')
  const thread = useRef<HTMLDivElement>(null)
  const threadContent = useRef<HTMLDivElement>(null)
  /** Follow new text only while the reader is at the bottom. */
  const stick = useRef(true)
  const lastTop = useRef(0)

  const showModels = useCallback((list: ModelInfo[]) => {
    setModels(list)
    setModelsError(list.length ? null : 'No models installed. Pull one with `ollama pull qwen3.5:2b-mlx`.')
    // Keep the current pick if it's still installed, else the default, else the first installed model.
    setModel((cur) =>
      list.some((m) => m.name === cur) ? cur : ((list.find((m) => m.name === DEFAULT_MODEL) ?? list[0])?.name ?? ''),
    )
  }, [])
  const showModelsError = useCallback((err: unknown) => {
    setModelsError(err instanceof Error ? err.message : String(err))
  }, [])
  const loadModels = () => listModels().then(showModels, showModelsError)

  useEffect(() => {
    listModels().then(showModels, showModelsError)
  }, [showModels, showModelsError])

  // Scrolling up stops the thread following the stream; scrolling back to the bottom resumes it.
  // A drop in scrollTop that leaves us at the bottom is the browser clamping after content
  // shrank (a thinking block folding), not the reader, so it doesn't count.
  const onThreadScroll = () => {
    const el = thread.current
    if (!el) return
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (fromBottom < 8) stick.current = true
    else if (el.scrollTop < lastTop.current - 1) stick.current = false
    lastTop.current = el.scrollTop
  }

  // Follow every change in the thread's height (new messages, streamed text, the smooth reveal).
  useEffect(() => {
    const el = thread.current
    const content = threadContent.current
    if (!el || !content) return
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const orb = describe(phase)
  const lastUser = items.findLastIndex((it) => it.kind === 'message' && it.message.role === 'user')
  const current = models.find((m) => m.name === model)
  const canThink = current?.capabilities?.includes('thinking') ?? false
  const canTools = current?.capabilities?.includes('tools') ?? false

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy || !model) return
    // Sending always jumps to the end and follows the new answer.
    stick.current = true
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
    setInput('')
    void send(text, { model, think: canThink && think, tools: canTools && tools })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) submit(e)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className={`brand-orb ${phase.kind === 'idle' ? 'idle' : ''}`}>
            <Orb key={orb.state} state={orb.state} speed={orb.speed} paused={phase.kind === 'idle'} size={orbSize('--size-orb-brand')} />
          </span>
          ponder
        </div>
        <div className="controls">
          <span className="picker">
            <Icon icon={Cpu} />
            <select
              aria-label="Model"
              title="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy || !models.length}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </span>
          <label className={`toggle ${canThink ? '' : 'disabled'}`} title={canThink ? 'Think before answering' : "This model can't think"}>
            <input type="checkbox" checked={canThink && think} disabled={!canThink || busy} onChange={(e) => setThink(e.target.checked)} />
            <Icon icon={Brain} />
            Thinking
          </label>
          {canTools && (
            <label className="toggle" title="get_time and read_file (./sandbox)">
              <input type="checkbox" checked={tools} disabled={busy} onChange={(e) => setTools(e.target.checked)} />
              <Icon icon={Wrench} />
              Tools
            </label>
          )}
          <button className="clear" onClick={clear} disabled={busy || !items.length} aria-label="Clear chat" title="Clear chat">
            <Icon icon={Trash2} />
            <span className="wide-only">Clear</span>
          </button>
        </div>
      </header>

      <main className="chat">
        {modelsError && (
          <div className="banner error">
            <div>
              <div className="eyebrow">Error</div>
              <span>{modelsError}</span>
            </div>
            <button onClick={() => void loadModels()}>
              Retry
            </button>
          </div>
        )}

        <div className="thread" ref={thread} onScroll={onThreadScroll}>
          <div className="thread-content" ref={threadContent}>
            {!items.length && !modelsError && (
              <div className="empty">
                <div className="eyebrow">New chat</div>
                <p>Ask {model || 'the model'} anything.</p>
              </div>
            )}
            {items.map((it, i) => {
              switch (it.kind) {
                case 'message':
                  return (
                    <Message
                      key={it.message.id}
                      message={it.message}
                      current={i > lastUser}
                      onSkipThinking={skipThinking}
                    />
                  )
                case 'error':
                  return (
                    <div key={it.id} className="notice error">
                      <div className="eyebrow">Error</div>
                      {it.text}
                    </div>
                  )
                case 'stopped':
                  return (
                    <div key={it.id} className="notice">
                      Stopped.
                    </div>
                  )
              }
            })}
            <OrbStatus phase={phase} />
          </div>
        </div>

        <form className="composer" onSubmit={submit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message"
            rows={1}
          />
          {busy ? (
            <button type="button" className="stop" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!input.trim() || !model}>
              Send
            </button>
          )}
        </form>
      </main>

      <ActivityPanel turns={activity} phase={phase} />
    </div>
  )
}
