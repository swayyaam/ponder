import type { LucideIcon } from 'lucide-react'

export type IconSize = 'sm' | 'md' | 'lg'

/**
 * A lucide icon at one of the theme's icon sizes (--icon-sm/md/lg), drawn in currentColor
 * with the same thin stroke everywhere. Always decorative: the control it sits in carries the label.
 */
export function Icon({ icon: Glyph, size = 'md', fill }: { icon: LucideIcon; size?: IconSize; fill?: boolean }) {
  return (
    <Glyph
      className={`icon icon-${size}`}
      strokeWidth={1.5}
      fill={fill ? 'currentColor' : 'none'}
      aria-hidden="true"
      focusable="false"
    />
  )
}
