# Changelog

## 0.1.2 (2026-10-07)

### Added

- Edit a prompt you already sent. The edit replaces that prompt and everything
  after it, then asks again.
- Retry button next to Copy under each reply, which asks the same prompt again.

### Changed

- Copy and Retry are always visible, muted until hovered, instead of only on
  hover.
- Activity lines use a distinct icon per kind (load, prompt, think, tool,
  generate, retry, done, stop, error) instead of identical paused orbs. The
  live line keeps its animated orb.

## 0.1.1 (2026-10-06)

### Added

- Icons across the UI, from lucide-react with a 1.5 stroke, sized by
  `--icon-sm/md/lg` tokens: the model picker, Thinking and Tools toggles,
  Clear (icon-only under 640px), Send and Stop, thinking and tool result
  chevrons, tool icons on tool calls, the error label and Retry, and loop
  guard retries in the Activity panel.
- Copy button under each reply. It copies the raw markdown and shows a check
  for 1.5s. It appears on hover or keyboard focus, and always on touch screens.

### Fixed

- The thread no longer pulls you back to the bottom while you scroll up to
  read during a reply. It follows new text only while you're at the bottom,
  resumes when you scroll back down, and jumps to the end when you send.

## 0.1.0 (2026-10-06)

First tagged release.

### Added

- Loop guard for runaway thinking. Thinking stops when the same block repeats
  3 times or passes 3000 tokens or 90 seconds, then the turn is retried once
  without thinking. The partial thinking stays visible and is marked
  "stopped: looping" or "stopped: over budget", and the retry is logged in the
  Activity panel.
- Skip thinking button while the model reasons, with the same retry.
- Live thinking token count in the thinking block header.
- Every request sends `num_predict: 8192`, so no response runs unbounded.
- Unit tests (vitest) for the loop detector and partial markdown handling.

### Changed

- Bigger orbs: the live status orb is 32px (was 18px) and the Activity orbs
  are 18px (was 14px). Orb sizes are tokens in `theme.css`.
- The thinking block renders markdown, muted and italic, with bold one step
  brighter.
- Streaming answers and thinking are revealed a few characters per frame
  instead of in bursts. Unfinished markdown no longer flashes raw `**` or `*`.
- The thinking block stays open while the answer streams and folds when the
  next turn starts, so the answer no longer jumps up when it begins.

### Fixed

- The last line of long thinking was clipped, and new thinking streamed out of
  view below the fold.
- After a hot reload, a streaming answer could also be written into an older
  message.
- After Retry, a model that had been removed stayed selected.
