/**
 * Safety net for small reasoning models that think forever. Every limit lives here.
 * When the guard trips, useChat aborts the request and retries the turn once with think: false.
 */

/** Cap on one response's thinking, by token count or wall time, whichever comes first. */
export const THINKING_BUDGET = { tokens: 3000, ms: 90_000 }

/** Sent as num_predict, so no single response (thinking plus answer) can run unbounded. */
export const MAX_RESPONSE_TOKENS = 8192

/** Thinking counts as looping when a block containing a SPAN-character run repeats REPEATS times in the last WINDOW characters. */
export const LOOP = { span: 40, repeats: 3, window: 4000 }

export type GuardReason = 'looping' | 'over budget' | 'skipped'

/**
 * True when the end of `text` is the same block repeated `repeats` times back to back.
 * It looks for the newest `span` characters earlier in the window, and only counts a loop
 * when the whole stretch between those matches is identical, so list items that share a
 * long phrase but differ elsewhere ("Day 1: ...", "Day 2: ...") don't trigger it.
 */
export function isLooping(text: string, { span, repeats, window } = LOOP): boolean {
  const tail = text.slice(-window)
  if (tail.length < span * repeats) return false
  const needle = tail.slice(-span)
  // Rules, dashes and other runs of a few characters aren't a model repeating itself.
  if (new Set(needle).size < 8) return false

  const at: number[] = []
  for (let i = tail.indexOf(needle); i !== -1; i = tail.indexOf(needle, i + span)) at.push(i)
  if (at.length < repeats) return false

  // The last `repeats` matches split the text into blocks; a loop repeats the whole block.
  const last = at.slice(-repeats)
  const blocks = last.slice(1).map((p, i) => tail.slice(last[i], p))
  return blocks.every((b) => b === blocks[0])
}

/** Watches one response's thinking as it streams and says why to stop it, if it should. */
export class ThinkingWatch {
  tokens = 0
  private started?: number

  /** Call once per thinking chunk (Ollama sends one token per chunk) with the thinking so far. */
  add(text: string, now: number): GuardReason | null {
    this.tokens++
    this.started ??= now
    if (this.tokens > THINKING_BUDGET.tokens || now - this.started > THINKING_BUDGET.ms) return 'over budget'
    return isLooping(text) ? 'looping' : null
  }
}
