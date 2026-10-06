import { describe, expect, it } from 'vitest'
import { closePartial } from './markdown'

describe('closePartial', () => {
  it('leaves complete markdown alone', () => {
    const text = 'Some **bold** and *italic* text.\n\n- one\n- two'
    expect(closePartial(text)).toBe(text)
  })

  it('closes open bold and italic', () => {
    expect(closePartial('This is **impor')).toBe('This is **impor**')
    expect(closePartial('This is *sli')).toBe('This is *sli*')
    expect(closePartial('**Day 1:** *visit ')).toBe('**Day 1:** *visit*')
  })

  it('drops an opener with nothing after it yet', () => {
    expect(closePartial('Next: **')).toBe('Next:')
    expect(closePartial('Next: *')).toBe('Next:')
  })

  it('holds back a lone block marker on the last line', () => {
    expect(closePartial('A paragraph\n-')).toBe('A paragraph')
    expect(closePartial('A paragraph\n1.')).toBe('A paragraph')
    expect(closePartial('Steps:\n2')).toBe('Steps:')
    expect(closePartial('Notes\n---')).toBe('Notes')
    expect(closePartial('- one\n- ')).toBe('- one')
  })

  it('ignores bullets and multiplication', () => {
    expect(closePartial('* item one\n* item two')).toBe('* item one\n* item two')
    expect(closePartial('So 2 * 8 = 16')).toBe('So 2 * 8 = 16')
  })

  it('closes open code', () => {
    expect(closePartial('Run `npm i')).toBe('Run `npm i`')
    expect(closePartial('```js\nconst a = 1')).toBe('```js\nconst a = 1\n```')
  })

  it('only looks at the last block', () => {
    expect(closePartial('Old *stray\n\nNew **bol')).toBe('Old *stray\n\nNew **bol**')
  })
})
