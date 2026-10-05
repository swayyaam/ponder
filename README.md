# ponder

A small local chat client for [Ollama](https://ollama.com) models. It uses
[Thinking Orbs](https://thinkingorbs.com) (`@yogesharc/thinking-orbs`) to show
what the model is doing. Every orb change comes from a real event in Ollama's
`/api/chat` stream. Nothing runs on a timer.

- Streams replies from `/api/chat`, with a **Thinking** toggle (the `think` param)
  and the model's thinking shown in a collapsible block above the answer
- Model picker filled from `/api/tags`. The Thinking and Tools toggles follow
  each model's reported `capabilities`
- Stop button (aborts the request)
- **Activity** panel that logs each turn: model load time, prompt tokens,
  how long it thought, tool calls, and tokens/sec, all taken from the stream's
  own fields
- Two tools with a full call loop (the model asks, ponder runs the tool, the
  result goes back, the model continues):
  - `get_time`: the local time, computed in the browser
  - `read_file`: reads a file from `./sandbox`, served by a small Vite
    dev-server endpoint that refuses any path outside that folder

## Requirements

- Ollama running locally at `http://localhost:11434`
  (`ollama serve`, or the Ollama app)
- A model, e.g. `ollama pull qwen3.5:2b-mlx` (the default)
- Node 20+

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. To point at a different Ollama, set `OLLAMA_URL`:

```bash
OLLAMA_URL=http://192.168.1.20:11434 npm run dev
```

The browser never talks to Ollama directly. Vite proxies `/ollama/*` to it, so
there are no CORS issues. `npm run build && npm run preview` works too, since
the proxy and the sandbox endpoint run in preview mode as well. ponder needs one
of the two: a static `dist/` on its own has no proxy and no `read_file`.

## Orb states

| What the stream is doing | How ponder detects it | Orb |
| --- | --- | --- |
| Request sent, no chunk yet (model loading or reading the prompt) | Request in flight, nothing received. Labelled "Loading <model>" when `/api/ps` showed the model wasn't in memory before sending | `working` |
| Thinking | Chunk has a non-empty `message.thinking` | `reasoning` |
| Tool call in progress | Chunk has `message.tool_calls`. Lasts while the tool runs and until the model's first chunk after it gets the result | `searching` |
| Writing the answer | Chunk has a non-empty `message.content` | `base`, at 0.6× speed (the calmest orb) |
| Done, stopped, or failed | Stream ended, request aborted, or an error came back | `base`, paused and dimmed. Errors are shown in the thread and the Activity panel |

The orb in the header always matches the current state. While a request runs,
a status line with the orb and its label sits under the thread.

### What the Activity panel reports

All numbers come from the final `done: true` chunk, where Ollama reports
durations in nanoseconds:

- **Loaded** `<model>` (`load_duration`): shown when the model was cold, or
  when loading took more than 0.5s
- **Read N prompt tokens** (`prompt_eval_count`, `prompt_eval_duration`,
  `prompt_eval_cached_count`)
- **Thought for Xs**: the `created_at` gap between the first thinking chunk
  and the first chunk after thinking ends
- **Called** `tool(args)`: how long the tool took to run in ponder, plus a
  preview of its result
- **Generated N tokens, R tok/s** (`eval_count / eval_duration`). This count
  includes thinking tokens

## Tools

Tools are sent only when the selected model lists `tools` in its capabilities.
`qwen3.5:2b-mlx` does, and handles both tools fine. With thinking off, small
models sometimes guess file names. A failed tool call goes back to the model as
an error message, so it can recover.

`read_file` calls `GET /api/sandbox?path=...`, defined in
[`server/sandbox.ts`](server/sandbox.ts). The endpoint:

- reads only from `./sandbox`. A leading `/` counts as the sandbox root, and
  `.`, `/` or `*` list the folder
- rejects `..` traversal, absolute paths that escape, and symlinks that point
  outside the folder (403)
- caps reads at 64 KB

Put your own files in `./sandbox` to let the model read them.

## Notes

- If Ollama isn't running you'll see: "Can't reach Ollama at
  http://localhost:11434. Start Ollama with `ollama serve`." Click Retry once
  it's up.
- History is kept in memory for the session (Clear resets it). Thinking text
  isn't sent back to the model.

## License

[MIT](LICENSE) © Swayam Mishra
