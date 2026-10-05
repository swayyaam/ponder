import { Orb } from '@yogesharc/thinking-orbs'
import { describe } from '../orbs'
import type { Phase } from '../useChat'

/** The live status line under the thread while a request is running. */
export function OrbStatus({ phase }: { phase: Phase }) {
  if (phase.kind === 'idle') return null
  const { state, label, speed } = describe(phase)
  return (
    <div className="status" data-phase={phase.kind}>
      <Orb key={state} state={state} speed={speed} size={18} label={label} />
      <span>{label}</span>
    </div>
  )
}
