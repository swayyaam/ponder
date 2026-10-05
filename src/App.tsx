import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Orb } from '@yogesharc/thinking-orbs'
import { ActivityPanel } from './components/ActivityPanel'
import { Message } from './components/Message'
import { OrbStatus, describe } from './components/OrbStatus'
import { listModels, type ModelInfo } from './ollama'
import { useChat } from './useChat'
import './App.css'

const DEFAULT_MODEL = 'qwen3.5:2b-mlx'

export default function App() {
  const { items, busy, phase, activity, send, stop, clear } = useChat()
  const [models, setModels] = useState<ModelInfo[]>([])
  const [model, setModel] = useState('')
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [think, setThink] = useState(true)
  const [input, setInput] = useState('')
  const threadEnd = useRef<HTMLDivElement>(null)

  const loadModels = useCallback(async () => {
    try {
      const list = await listModels()
      setModels(list)
      setModelsError(list.length ? null : 'No models installed. Pull one with `ollama pull qwen3.5:2b-mlx`.')
      setModel((cur) => cur || (list.find((m) => m.name === DEFAULT_MODEL) ?? list[0])?.name || '')
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'end' })
  }, [items, phase])

  const orb = describe(phase)
  const current = models.find((m) => m.name === model)
  const canThink = current?.capabilities?.includes('thinking') ?? false

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy || !model) return
    setInput('')
    void send(text, { model, think: canThink && think })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) submit(e)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className={`brand-orb ${phase.kind === 'idle' ? 'idle' : ''}`}>
            <Orb key={orb.state} state={orb.state} speed={orb.speed} paused={phase.kind === 'idle'} size={20} />
          </span>
          ponder
        </div>
        <div className="controls">
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy || !models.length}>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <label className={`toggle ${canThink ? '' : 'disabled'}`} title={canThink ? '' : "This model can't think"}>
            <input type="checkbox" checked={canThink && think} disabled={!canThink || busy} onChange={(e) => setThink(e.target.checked)} />
            Thinking
          </label>
          <button className="ghost" onClick={clear} disabled={busy || !items.length}>
            Clear
          </button>
        </div>
      </header>

      <main className="chat">
        {modelsError && (
          <div className="banner error">
            <span>{modelsError}</span>
            <button className="ghost" onClick={() => void loadModels()}>
              Retry
            </button>
          </div>
        )}

        <div className="thread">
          {!items.length && !modelsError && <div className="empty">Ask {model || 'the model'} anything.</div>}
          {items.map((it) => {
            switch (it.kind) {
              case 'message':
                return <Message key={it.message.id} message={it.message} />
              case 'error':
                return (
                  <div key={it.id} className="notice error">
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
          <div ref={threadEnd} />
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
            <button type="submit" disabled={!input.trim() || !model}>
              Send
            </button>
          )}
        </form>
      </main>

      <ActivityPanel turns={activity} phase={phase} />
    </div>
  )
}
