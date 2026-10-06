/**
 * Markdown that's still streaming, closed so it renders the way it will once complete.
 * Without this, "**bo" shows literal asterisks that snap to bold a moment later, and a
 * lone "-" under a paragraph briefly turns that paragraph into a heading.
 */
export function closePartial(text: string): string {
  // Hold back a last line that is only a block marker so far: "-", "*", "1.", "#", "---", "===", ">".
  let out = text.replace(/(^|\n)[ \t]*(?:[-*+=#>]+|\d+[.)]?)[ \t]*$/, '$1')

  const fences = out.match(/^[ \t]*```/gm)?.length ?? 0
  if (fences % 2) return `${out}\n\`\`\``

  // Inline markers can only be open in the last block.
  const start = out.lastIndexOf('\n\n') + 1
  // A trailing "*" after a space has nothing to emphasise yet.
  let block = out.slice(start).trimEnd().replace(/\s\*$/, '')
  out = out.slice(0, start)

  if ((block.match(/`/g)?.length ?? 0) % 2) {
    return /`$/.test(block) ? out + block.slice(0, -1) : `${out + block}\``
  }

  // Look for emphasis outside code spans and list bullets.
  const plain = block.replace(/`[^`]*`/g, '').replace(/^[ \t]*[*+-][ \t]+/gm, '')
  const closers: string[] = []

  // A * between spaces (like 2 * 8) is plain text, not emphasis.
  const singles = plain.replace(/\*\*/g, '').match(/(?<!\s|^)\*|\*(?!\s|$)/gm)?.length ?? 0
  if (singles % 2) {
    if (/(?<!\*)\*$/.test(block)) block = block.slice(0, -1).trimEnd()
    else closers.push('*')
  }
  if ((plain.match(/\*\*/g)?.length ?? 0) % 2) {
    if (/\*\*$/.test(block)) block = block.slice(0, -2).trimEnd()
    else closers.push('**')
  }
  return out + block + closers.join('')
}
