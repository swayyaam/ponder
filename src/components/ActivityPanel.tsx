import { useEffect, useRef } from 'react'
import { Orb, type OrbState } from '@yogesharc/thinking-orbs'
import { Repeat } from 'lucide-react'
import type { ActivityKind, ActivityTurn, Phase } from '../useChat'
import { describe, orbSize } from '../orbs'
import { Icon } from './Icon'

/** Each line gets a still orb of the state it came from. */
const ICON: Record<ActivityKind, OrbState> = {
  load: 'working',
  prompt: 'waiting',
  think: 'reasoning',
  tool: 'searching',
  generate: 'base',
  retry: 'retrying',
  done: 'base',
  stop: 'base',
  error: 'base',
}

export function ActivityPanel({ turns, phase }: { turns: ActivityTurn[]; phase: Phase }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, phase])

  const live = describe(phase)
  return (
    <aside className="activity">
      <h2>Activity</h2>
      {!turns.length && <p className="activity-empty">What the model does on each turn shows up here.</p>}
      {turns.map((turn, i) => (
        <section key={turn.id} className="turn">
          <div className="turn-prompt" title={turn.prompt}>
            {turn.prompt}
          </div>
          <ul>
            {turn.events.map((e) => (
              <li key={e.id} className={`event ${e.kind}`}>
                <Orb state={ICON[e.kind]} size={orbSize('--size-orb-event')} paused />
                <div>
                  <div className={e.kind === 'retry' ? 'event-guard' : undefined}>
                    {e.kind === 'retry' && <Icon icon={Repeat} size="sm" />}
                    {e.text}
                  </div>
                  {e.detail && <div className="event-detail">{e.detail}</div>}
                </div>
              </li>
            ))}
            {i === turns.length - 1 && phase.kind !== 'idle' && (
              <li className="event live">
                <Orb key={live.state} state={live.state} speed={live.speed} size={orbSize('--size-orb-event')} />
                <div>{live.label}…</div>
              </li>
            )}
          </ul>
        </section>
      ))}
      <div ref={end} />
    </aside>
  )
}
