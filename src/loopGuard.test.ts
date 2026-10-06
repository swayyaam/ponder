import { describe, expect, it } from 'vitest'
import { THINKING_BUDGET, ThinkingWatch, isLooping } from './loopGuard'

const intro = 'The user asks how many times the letter r appears in strawberry. '

describe('isLooping', () => {
  it('catches the same block repeated three times', () => {
    const block = 'Wait, let me count again: s-t-r-a-w-b-e-r-r-y, that gives 3 r letters. '
    expect(isLooping(intro + block.repeat(3))).toBe(true)
  })

  it('catches a loop while the third copy is still streaming', () => {
    const block = 'Hmm, I should double check the spelling of strawberry before I answer. '
    const text = intro + block.repeat(2) + block.slice(0, 50)
    expect(isLooping(text)).toBe(true)
  })

  it('needs three copies, not two', () => {
    const block = 'Wait, let me count again: s-t-r-a-w-b-e-r-r-y, that gives 3 r letters. '
    expect(isLooping(intro + block.repeat(2))).toBe(false)
  })

  it('ignores normal reasoning', () => {
    const text =
      intro +
      'Spelling it out: s, t, r, a, w, b, e, r, r, y. The r appears at position 3, then at 8 and 9. ' +
      'So there are three of them. People often say two because the double r reads as one sound. ' +
      'I will answer 3 and mention the double r.'
    expect(isLooping(text)).toBe(false)
  })

  it('ignores list items that share a long phrase', () => {
    const text =
      'Plan:\n' +
      '- **Day 1:** Morning walk through the temple grounds and the moss garden nearby\n' +
      '- **Day 2:** Morning walk through the temple grounds and the moss garden nearby\n' +
      '- **Day 3:** Morning walk through the temple grounds and the moss garden nearby\n'
    expect(isLooping(text)).toBe(false)
  })

  it('ignores numbered steps with the same wording', () => {
    const steps = [1, 2, 3, 4].map((n) => `${n}. Check the remaining count after this step and write it down carefully.\n`)
    expect(isLooping(steps.join(''))).toBe(false)
  })

  it('ignores long horizontal rules', () => {
    expect(isLooping(intro + '-'.repeat(200))).toBe(false)
  })
})

describe('ThinkingWatch', () => {
  it('trips on the token budget', () => {
    const watch = new ThinkingWatch()
    let reason = null
    for (let i = 0; i <= THINKING_BUDGET.tokens && !reason; i++) reason = watch.add(`word ${i} `, 0)
    expect(reason).toBe('over budget')
    expect(watch.tokens).toBe(THINKING_BUDGET.tokens + 1)
  })

  it('trips on the time budget', () => {
    const watch = new ThinkingWatch()
    expect(watch.add('Thinking', 1000)).toBe(null)
    expect(watch.add('Thinking more', 1000 + THINKING_BUDGET.ms + 1)).toBe('over budget')
  })

  it('reports a loop', () => {
    const watch = new ThinkingWatch()
    const block = 'Let me reconsider whether all but nine means nine remain or eight remain. '
    expect(watch.add(intro + block.repeat(3), 0)).toBe('looping')
  })
})
