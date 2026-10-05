import Markdown from 'react-markdown'
import type { UIMessage } from '../useChat'

export function Message({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    return <div className="msg user">{message.content}</div>
  }

  return (
    <div className="msg assistant">
      {message.thinking && (
        <details className="thinking" open={message.live}>
          <summary>Thinking</summary>
          <div className="thinking-text">{message.thinking}</div>
        </details>
      )}
      {message.content && (
        <div className="markdown">
          <Markdown>{message.content}</Markdown>
        </div>
      )}
    </div>
  )
}
