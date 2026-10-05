import type { ToolCall, ToolDef } from './ollama'

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: "Get the user's current local date, time and time zone.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: "Read a text file from the user's sandbox folder. Pass \".\" to list the files in it.",
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the sandbox folder, e.g. "notes.txt"' },
        },
        required: ['path'],
      },
    },
  },
]

export interface ToolResult {
  ok: boolean
  output: string
}

/** "read_file(notes.txt)" */
export const describeCall = ({ function: f }: ToolCall) =>
  `${f.name}(${Object.values(f.arguments ?? {}).map(String).join(', ')})`

/** Runs a tool the model asked for. Failures go back to the model as text so it can respond to them. */
export async function runTool(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
  const { name, arguments: args } = call.function
  try {
    switch (name) {
      case 'get_time':
        return { ok: true, output: getTime() }
      case 'read_file':
        return { ok: true, output: await readFile(String(args?.path ?? '.'), signal) }
      default:
        return { ok: false, output: `Error: there is no tool called "${name}"` }
    }
  } catch (err) {
    if (signal.aborted) throw err
    return { ok: false, output: `Error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function getTime() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return `${new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })} (${zone})`
}

async function readFile(path: string, signal: AbortSignal) {
  const res = await fetch(`/api/sandbox?path=${encodeURIComponent(path)}`, { signal })
  const data = (await res.json()) as { content?: string; error?: string }
  if (!res.ok || data.error !== undefined) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data.content ?? ''
}
