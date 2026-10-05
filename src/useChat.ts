import { useCallback, useRef, useState } from 'react'
import { loadedModels, streamChat, type ChatChunk, type ChatMessage } from './ollama'

export interface UIMessage extends ChatMessage {
  id: string
  /** Still streaming. */
  live?: boolean
  /** Server time from the first thinking chunk to the first chunk after it. */
  thoughtMs?: number
}

/** What the model is doing right now, driven only by what the stream sends. */
export type Phase =
  | { kind: 'idle' }
  /** Request sent, no chunk back yet. `loading` when /api/ps said the model wasn't in memory. */
  | { kind: 'working'; model: string; loading: boolean }
  /** Chunks carrying message.thinking. */
  | { kind: 'reasoning' }
  /** A tool_calls chunk arrived; lasts until the model's first chunk after getting the result. */
  | { kind: 'tool'; name: string }
  /** Chunks carrying message.content. */
  | { kind: 'streaming' }

export type Item =
  | { kind: 'message'; message: UIMessage }
  | { kind: 'error'; id: string; text: string }
  | { kind: 'stopped'; id: string }

export interface SendOptions {
  model: string
  think: boolean
}

let lastId = 0
const uid = () => String(++lastId)

/** A chunk's server timestamp in ms. created_at has microseconds; Date.parse keeps the ms. */
const at = (chunk: ChatChunk) => {
  const t = Date.parse(chunk.created_at)
  return Number.isNaN(t) ? Date.now() : t
}

/** What goes back to Ollama as history: no UI fields, no thinking text. */
const toApi = ({ role, content, tool_calls, tool_name, tool_call_id }: ChatMessage): ChatMessage => ({
  role,
  content,
  ...(tool_calls && { tool_calls }),
  ...(tool_name && { tool_name }),
  ...(tool_call_id && { tool_call_id }),
})

export function useChat() {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const phaseRef = useRef<Phase>({ kind: 'idle' })
  const history = useRef<ChatMessage[]>([])
  const abort = useRef<AbortController | null>(null)

  const go = (next: Phase) => {
    if (JSON.stringify(next) === JSON.stringify(phaseRef.current)) return
    phaseRef.current = next
    setPhase(next)
  }

  const push = (item: Item) => setItems((prev) => [...prev, item])
  const patch = (id: string, fn: (m: UIMessage) => UIMessage) =>
    setItems((prev) =>
      prev.map((it) => (it.kind === 'message' && it.message.id === id ? { ...it, message: fn(it.message) } : it)),
    )

  /** One /api/chat request, streamed into a new assistant message. */
  const runRound = async (opts: SendOptions, signal: AbortSignal, loading: boolean) => {
    const assistant: UIMessage = { id: uid(), role: 'assistant', content: '', thinking: '', live: true }
    let shown = false
    let final: ChatChunk | undefined
    let thinkStart: number | undefined
    // After a tool call the orb stays on the tool until the model answers again.
    if (phaseRef.current.kind !== 'tool') go({ kind: 'working', model: opts.model, loading })
    try {
      for await (const chunk of streamChat(
        { model: opts.model, messages: history.current, think: opts.think },
        signal,
      )) {
        const m = chunk.message
        if (m?.thinking) {
          assistant.thinking += m.thinking
          thinkStart ??= at(chunk)
          go({ kind: 'reasoning' })
        }
        if (m?.content) {
          assistant.content += m.content
          go({ kind: 'streaming' })
        }
        if (m?.tool_calls?.length) {
          assistant.tool_calls = [...(assistant.tool_calls ?? []), ...m.tool_calls]
          go({ kind: 'tool', name: m.tool_calls[0].function.name })
        }
        if (thinkStart !== undefined && assistant.thoughtMs === undefined && !m?.thinking) {
          assistant.thoughtMs = at(chunk) - thinkStart
        }
        if (chunk.done) final = chunk

        if (!shown) {
          shown = true
          push({ kind: 'message', message: { ...assistant } })
        } else {
          patch(assistant.id, () => ({ ...assistant }))
        }
      }
    } finally {
      assistant.live = false
      if (shown) patch(assistant.id, () => ({ ...assistant }))
      // Keep whatever arrived, even if stopped midway, so the next turn has context.
      if (assistant.content || assistant.tool_calls) history.current.push(toApi(assistant))
    }
    return { assistant, final }
  }

  const send = useCallback(async (text: string, opts: SendOptions) => {
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)

    const user: UIMessage = { id: uid(), role: 'user', content: text }
    history.current.push(toApi(user))
    push({ kind: 'message', message: user })

    try {
      go({ kind: 'working', model: opts.model, loading: false })
      // Ask before sending: once the request is in, /api/ps already lists the model while it loads.
      const loading = !(await loadedModels().catch((): string[] => [])).includes(opts.model)
      await runRound(opts, ctrl.signal, loading)
    } catch (err) {
      if (ctrl.signal.aborted) {
        push({ kind: 'stopped', id: uid() })
      } else {
        push({ kind: 'error', id: uid(), text: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      abort.current = null
      go({ kind: 'idle' })
      setBusy(false)
    }
  }, [])

  const stop = useCallback(() => abort.current?.abort(), [])

  const clear = useCallback(() => {
    abort.current?.abort()
    history.current = []
    setItems([])
  }, [])

  return { items, busy, phase, send, stop, clear }
}
