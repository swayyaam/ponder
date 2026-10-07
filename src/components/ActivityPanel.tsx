import { useEffect, useRef } from 'react'
import { Orb } from '@yogesharc/thinking-orbs'
import {
  BookOpen,
  Brain,
  CircleAlert,
  CircleCheck,
  CircleStop,
  MemoryStick,
  PenLine,
  Repeat,
  type LucideIcon,
} from 'lucide-react'
import type { ActivityEvent, ActivityKind, ActivityTurn, Phase } from '../useChat'
import { describe, orbSize } from '../orbs'
import { toolIcon } from '../toolIcons'
import { Icon } from './Icon'

/**
 * Finished lines get an icon for what happened, each a different shape so they're easy to
 * tell apart at a glance. Only the live line keeps an orb, since it's the one still moving.
 */
const ICON: Record<ActivityKind, LucideIcon> = {
  load: MemoryStick,
  prompt: BookOpen,
  think: Brain,
  tool: toolIcon(),
  generate: PenLine,
  retry: Repeat,
  done: CircleCheck,
  stop: CircleStop,
  error: CircleAlert,
}

const eventIcon = (e: ActivityEvent) => (e.kind === 'tool' ? toolIcon(e.tool) : ICON[e.kind])

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
                <Icon icon={eventIcon(e)} />
                <div>
                  <div>{e.text}</div>
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
