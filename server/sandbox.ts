// Dev-server endpoint behind the read_file tool: GET /api/sandbox?path=notes.txt
// Only files inside the sandbox folder can be read. "..", absolute paths and
// symlinks that point outside it are all rejected.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

const MAX_BYTES = 64 * 1024

class SandboxError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The real path of `rel` inside `root`, or a SandboxError if it lands outside. */
export async function resolveInside(root: string, rel: string): Promise<string> {
  const base = await fs.realpath(root)
  const inside = (p: string) => p === base || p.startsWith(base + path.sep)

  const target = path.resolve(base, rel)
  if (!inside(target)) throw new SandboxError(403, `"${rel}" is outside the sandbox`)

  let real: string
  try {
    real = await fs.realpath(target)
  } catch {
    throw new SandboxError(404, `No such file in the sandbox: ${rel}`)
  }
  // Catches symlinks inside the sandbox that point elsewhere.
  if (!inside(real)) throw new SandboxError(403, `"${rel}" is outside the sandbox`)
  return real
}

async function read(root: string, rel: string): Promise<string> {
  const file = await resolveInside(root, rel)
  const stat = await fs.stat(file)

  if (stat.isDirectory()) {
    const entries = await fs.readdir(file, { withFileTypes: true })
    const names = entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
    return names.length ? `Files in ${rel}:\n${names.join('\n')}` : `${rel} is empty.`
  }

  const buf = await fs.readFile(file)
  const text = buf.subarray(0, MAX_BYTES).toString('utf8')
  return buf.length > MAX_BYTES ? `${text}\n[truncated at ${MAX_BYTES} bytes]` : text
}

export function sandbox(dir: string): Plugin {
  const root = path.resolve(dir)

  const handler: Connect.NextHandleFunction = (req, res) => {
    const send = (status: number, body: object) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'GET') return send(405, { error: 'Only GET is supported' })

    const rel = new URL(req.url ?? '/', 'http://localhost').searchParams.get('path') || '.'
    read(root, rel).then(
      (content) => send(200, { path: rel, content }),
      (err: Error) => send(err instanceof SandboxError ? err.status : 400, { error: err.message }),
    )
  }

  return {
    name: 'ponder-sandbox',
    configureServer(server) {
      server.middlewares.use('/api/sandbox', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/sandbox', handler)
    },
  }
}
