import { useCallback, useRef, useState } from 'react'
import { streamChat, type ChatChunk, type ChatMessage } from './ollama'

export interface UIMessage extends ChatMessage {
  id: string
  /** Still streaming. */
  live?: boolean
}

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
  const history = useRef<ChatMessage[]>([])
  const abort = useRef<AbortController | null>(null)

  const push = (item: Item) => setItems((prev) => [...prev, item])
  const patch = (id: string, fn: (m: UIMessage) => UIMessage) =>
    setItems((prev) =>
      prev.map((it) => (it.kind === 'message' && it.message.id === id ? { ...it, message: fn(it.message) } : it)),
    )

  /** One /api/chat request, streamed into a new assistant message. */
  const runRound = async (opts: SendOptions, signal: AbortSignal) => {
    const assistant: UIMessage = { id: uid(), role: 'assistant', content: '', thinking: '', live: true }
    let shown = false
    let final: ChatChunk | undefined
    try {
      for await (const chunk of streamChat(
        { model: opts.model, messages: history.current, think: opts.think },
        signal,
      )) {
        const m = chunk.message
        if (m?.thinking) assistant.thinking += m.thinking
        if (m?.content) assistant.content += m.content
        if (m?.tool_calls?.length) assistant.tool_calls = [...(assistant.tool_calls ?? []), ...m.tool_calls]
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
      await runRound(opts, ctrl.signal)
    } catch (err) {
      if (ctrl.signal.aborted) {
        push({ kind: 'stopped', id: uid() })
      } else {
        push({ kind: 'error', id: uid(), text: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      abort.current = null
      setBusy(false)
    }
  }, [])

  const stop = useCallback(() => abort.current?.abort(), [])

  const clear = useCallback(() => {
    abort.current?.abort()
    history.current = []
    setItems([])
  }, [])

  return { items, busy, send, stop, clear }
}
