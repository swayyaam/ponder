// Thin client for Ollama's HTTP API, reached through the Vite proxy at /ollama.
// Shapes below match what /api/chat actually streams (one JSON object per line):
//   thinking chunk: { message: { content: "", thinking: "..." }, done: false }
//   content chunk:  { message: { content: "..." }, done: false }
//   tool chunk:     { message: { content: "", tool_calls: [...] }, done: false }
//   final chunk:    { done: true, done_reason, load_duration, prompt_eval_count, eval_count, ... }
// Durations are nanoseconds and only appear on the final chunk.

const BASE = '/ollama'

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id?: string
  function: {
    index?: number
    name: string
    arguments: Record<string, unknown>
  }
}

export interface ChatMessage {
  role: Role
  content: string
  thinking?: string
  tool_calls?: ToolCall[]
  tool_name?: string
  tool_call_id?: string
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description?: string }>
      required: string[]
    }
  }
}

export interface ChatChunk {
  model: string
  created_at: string
  message?: {
    role: 'assistant'
    content: string
    thinking?: string
    tool_calls?: ToolCall[]
  }
  done: boolean
  done_reason?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_cached_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
  error?: string
}

export interface ModelInfo {
  name: string
  capabilities?: string[]
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  think?: boolean
  tools?: ToolDef[]
}

/** Ollama isn't answering at all (not running, wrong port). */
export class OllamaUnreachableError extends Error {
  constructor() {
    super(`Can't reach Ollama at ${__OLLAMA_URL__}. Start Ollama with \`ollama serve\`.`)
    this.name = 'OllamaUnreachableError'
  }
}

async function ollamaFetch(path: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(BASE + path, init)
  } catch (err) {
    if (init?.signal?.aborted) throw err
    throw new OllamaUnreachableError()
  }
  if (!res.ok) {
    // Ollama errors are JSON ({"error": "..."}). The Vite proxy answers an
    // unreachable target with an empty 502, which means Ollama is down.
    const text = await res.text()
    let message = ''
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? ''
    } catch {
      // not JSON
    }
    if (!message && res.status >= 500) throw new OllamaUnreachableError()
    throw new Error(message || `Ollama returned HTTP ${res.status}`)
  }
  return res
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await ollamaFetch('/api/tags')
  const data = (await res.json()) as { models: ModelInfo[] }
  return data.models
}

/** Names of the models currently loaded in memory (/api/ps). */
export async function loadedModels(): Promise<string[]> {
  const res = await ollamaFetch('/api/ps')
  const data = (await res.json()) as { models: { name: string }[] }
  return data.models.map((m) => m.name)
}

/** Streams /api/chat, yielding each NDJSON chunk as it arrives. */
export async function* streamChat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatChunk> {
  const res = await ollamaFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, stream: true }),
    signal,
  })
  if (!res.body) throw new Error('Ollama sent an empty response')

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  const parse = (line: string): ChatChunk => {
    const chunk = JSON.parse(line) as ChatChunk
    if (chunk.error) throw new Error(chunk.error)
    return chunk
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) yield parse(line)
    }
  }
  if (buffer.trim()) yield parse(buffer.trim())
}
