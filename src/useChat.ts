import { useCallback, useRef, useState } from 'react'
import { loadedModels, streamChat, type ChatChunk, type ChatMessage } from './ollama'
import { MAX_RESPONSE_TOKENS, THINKING_BUDGET, ThinkingWatch, type GuardReason } from './loopGuard'
import { TOOLS, describeCall, runTool } from './tools'

export interface UIMessage extends ChatMessage {
  id: string
  /** Still streaming. */
  live?: boolean
  /** Server time from the first thinking chunk to the first chunk after it. */
  thoughtMs?: number
  /** Thinking chunks so far; Ollama sends one token per chunk. */
  thinkingTokens?: number
  /** Why the loop guard cut the thinking short. */
  thinkingStopped?: GuardReason
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

export type ActivityKind = 'load' | 'prompt' | 'think' | 'tool' | 'generate' | 'retry' | 'done' | 'stop' | 'error'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  text: string
  detail?: string
}

/** Everything that happened while answering one user message. */
export interface ActivityTurn {
  id: string
  prompt: string
  events: ActivityEvent[]
}

export interface SendOptions {
  model: string
  think: boolean
  tools: boolean
}

/** How many times in one turn the model may call tools before we stop looping. */
const MAX_TOOL_ROUNDS = 5

// A hot reload resets this counter but keeps the messages on screen, so the time
// prefix keeps new ids from colliding with old ones (patch() matches by id).
let lastId = 0
const uid = () => `${Date.now().toString(36)}-${++lastId}`

/** A chunk's server timestamp in ms. created_at has microseconds; Date.parse keeps the ms. */
const at = (chunk: ChatChunk) => {
  const t = Date.parse(chunk.created_at)
  return Number.isNaN(t) ? Date.now() : t
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const NS = 1e6

const RETRY_TEXT: Record<GuardReason, string> = {
  looping: 'Thinking looped, retried without thinking',
  'over budget': `Thinking went over budget (${THINKING_BUDGET.tokens} tokens or ${THINKING_BUDGET.ms / 1000}s), retried without thinking`,
  skipped: 'Skipped thinking, retried without thinking',
}

/** Activity lines for one finished (or cut short) request, in the order things happened. */
function roundEvents(model: string, loading: boolean, assistant: UIMessage, final?: ChatChunk) {
  const out: Omit<ActivityEvent, 'id'>[] = []
  if (final?.load_duration !== undefined && (loading || final.load_duration > 500 * NS)) {
    out.push({ kind: 'load', text: `Loaded ${model} (${secs(final.load_duration / NS)})` })
  }
  if (final?.prompt_eval_count !== undefined && final.prompt_eval_duration !== undefined) {
    const cached = final.prompt_eval_cached_count
    out.push({
      kind: 'prompt',
      text: `Read ${final.prompt_eval_count} prompt tokens in ${secs(final.prompt_eval_duration / NS)}`,
      detail: cached ? `${cached} from cache` : undefined,
    })
  }
  if (assistant.thoughtMs !== undefined) {
    out.push({ kind: 'think', text: `Thought for ${secs(assistant.thoughtMs)}`, detail: assistant.thinkingStopped && `stopped: ${assistant.thinkingStopped}` })
  }
  if (final?.eval_count !== undefined && final.eval_duration) {
    const rate = final.eval_count / (final.eval_duration / 1e9)
    out.push({
      kind: 'generate',
      text: `Generated ${final.eval_count} tokens, ${Math.round(rate)} tok/s`,
      detail: assistant.thinking ? 'includes thinking tokens' : undefined,
    })
  }
  if (final?.done_reason === 'length') {
    out.push({ kind: 'error', text: `Cut off at the ${MAX_RESPONSE_TOKENS}-token response limit` })
  }
  return out
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
  const [activity, setActivity] = useState<ActivityTurn[]>([])
  const phaseRef = useRef<Phase>({ kind: 'idle' })
  const history = useRef<ChatMessage[]>([])
  const abort = useRef<AbortController | null>(null)
  /** Stops the current response's thinking and retries without it (the Skip thinking button). */
  const skip = useRef<(() => void) | null>(null)

  const go = (next: Phase) => {
    if (JSON.stringify(next) === JSON.stringify(phaseRef.current)) return
    phaseRef.current = next
    setPhase(next)
  }

  /** Append to the current (last) turn's activity. */
  const log = (...events: Omit<ActivityEvent, 'id'>[]) =>
    setActivity((prev) => {
      const last = prev[prev.length - 1]
      if (!last) return prev
      return [...prev.slice(0, -1), { ...last, events: [...last.events, ...events.map((e) => ({ ...e, id: uid() }))] }]
    })

  const push = (item: Item) => setItems((prev) => [...prev, item])
  const patch = (id: string, fn: (m: UIMessage) => UIMessage) =>
    setItems((prev) =>
      prev.map((it) => (it.kind === 'message' && it.message.id === id ? { ...it, message: fn(it.message) } : it)),
    )

  /**
   * One /api/chat request, streamed into a new assistant message. If the loop guard (or Skip
   * thinking) stops it mid-thought, it returns `cut` instead of throwing, so the turn can retry.
   */
  const runRound = async (opts: SendOptions, signal: AbortSignal, loading: boolean) => {
    const assistant: UIMessage = { id: uid(), role: 'assistant', content: '', thinking: '', live: true }
    let shown = false
    let final: ChatChunk | undefined
    let thinkStart: number | undefined
    let lastAt: number | undefined
    let cut: GuardReason | undefined
    const guard = new AbortController()
    const watch = new ThinkingWatch()
    const stopThinking = (reason: GuardReason) => {
      if (cut || assistant.thoughtMs !== undefined) return
      cut = reason
      guard.abort()
    }
    skip.current = () => stopThinking('skipped')
    // After a tool call the orb stays on the tool until the model answers again.
    if (phaseRef.current.kind !== 'tool') go({ kind: 'working', model: opts.model, loading })
    try {
      for await (const chunk of streamChat(
        {
          model: opts.model,
          messages: history.current,
          think: opts.think,
          ...(opts.tools && { tools: TOOLS }),
          options: { num_predict: MAX_RESPONSE_TOKENS },
        },
        AbortSignal.any([signal, guard.signal]),
      )) {
        // Chunks already in flight when the guard tripped don't count.
        if (cut) break
        const m = chunk.message
        lastAt = at(chunk)
        if (m?.thinking) {
          assistant.thinking += m.thinking
          thinkStart ??= at(chunk)
          const reason = watch.add(assistant.thinking ?? '', performance.now())
          assistant.thinkingTokens = watch.tokens
          if (reason) stopThinking(reason)
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
    } catch (err) {
      if (!cut || signal.aborted) throw err
    } finally {
      skip.current = null
      assistant.live = false
      if (cut) {
        assistant.thinkingStopped = cut
        if (thinkStart !== undefined && lastAt !== undefined) assistant.thoughtMs = lastAt - thinkStart
      }
      if (shown) patch(assistant.id, () => ({ ...assistant }))
      log(...roundEvents(opts.model, loading, assistant, final))
      // Keep whatever arrived, even if stopped midway, so the next turn has context.
      if (assistant.content || assistant.tool_calls) history.current.push(toApi(assistant))
    }
    return { assistant, final, cut }
  }

  const send = useCallback(async (text: string, opts: SendOptions) => {
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)

    const user: UIMessage = { id: uid(), role: 'user', content: text }
    history.current.push(toApi(user))
    push({ kind: 'message', message: user })
    setActivity((prev) => [...prev, { id: uid(), prompt: text, events: [] }])
    const started = performance.now()

    try {
      go({ kind: 'working', model: opts.model, loading: false })
      // Ask before sending: once the request is in, /api/ps already lists the model while it loads.
      const loaded = await loadedModels().catch(() => null)
      let loading = loaded ? !loaded.includes(opts.model) : false

      // Model asks for tools -> run them -> send results back -> model continues.
      let think = opts.think
      for (let round = 0; ; round++) {
        const { assistant, cut } = await runRound({ ...opts, think }, ctrl.signal, loading)
        loading = false
        // Thinking looped, ran over budget, or was skipped: answer the same turn once more without it.
        if (cut) {
          if (!think) break
          log({ kind: 'retry', text: RETRY_TEXT[cut] })
          think = false
          round--
          continue
        }
        const calls = assistant.tool_calls
        if (!calls?.length) break
        if (round >= MAX_TOOL_ROUNDS) {
          log({ kind: 'error', text: `Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls` })
          break
        }
        for (const call of calls) {
          go({ kind: 'tool', name: call.function.name })
          const t = performance.now()
          const result = await runTool(call, ctrl.signal)
          ctrl.signal.throwIfAborted()
          const toolMsg: UIMessage = {
            id: uid(),
            role: 'tool',
            content: result.output,
            tool_name: call.function.name,
            tool_call_id: call.id,
          }
          history.current.push(toApi(toolMsg))
          push({ kind: 'message', message: toolMsg })
          const preview = result.output.length > 80 ? `${result.output.slice(0, 80)}…` : result.output
          log({
            kind: result.ok ? 'tool' : 'error',
            text: `Called ${describeCall(call)} (${Math.round(performance.now() - t)}ms)`,
            detail: preview.replace(/\s+/g, ' '),
          })
        }
      }
      log({ kind: 'done', text: `Finished in ${secs(performance.now() - started)}` })
    } catch (err) {
      if (ctrl.signal.aborted) {
        push({ kind: 'stopped', id: uid() })
        log({ kind: 'stop', text: `Stopped by user after ${secs(performance.now() - started)}` })
      } else {
        const text = err instanceof Error ? err.message : String(err)
        push({ kind: 'error', id: uid(), text })
        log({ kind: 'error', text: 'Request failed', detail: text })
      }
    } finally {
      abort.current = null
      go({ kind: 'idle' })
      setBusy(false)
    }
  }, [])

  const stop = useCallback(() => abort.current?.abort(), [])
  const skipThinking = useCallback(() => skip.current?.(), [])

  const clear = useCallback(() => {
    abort.current?.abort()
    history.current = []
    setItems([])
    setActivity([])
  }, [])

  return { items, busy, phase, activity, send, stop, skipThinking, clear }
}
