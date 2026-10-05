import { Orb, type OrbState } from '@yogesharc/thinking-orbs'
import type { Phase } from '../useChat'

/** Which orb, and what to call it, for each phase. */
export function describe(phase: Phase): { state: OrbState; label: string; speed?: number } {
  switch (phase.kind) {
    case 'idle':
      return { state: 'base', label: 'Idle' }
    case 'working':
      return { state: 'working', label: phase.loading ? `Loading ${phase.model}` : 'Working' }
    case 'reasoning':
      return { state: 'reasoning', label: 'Reasoning' }
    case 'tool':
      return { state: 'searching', label: `Calling ${phase.name}` }
    case 'streaming':
      // Base is the plainest orb: a slow turn of the sphere, slowed a little more.
      return { state: 'base', label: 'Writing', speed: 0.6 }
  }
}

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
