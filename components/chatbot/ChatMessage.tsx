import ResponsiveImage from '@/components/common/ResponsiveImage';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CHATBOT_ICON, safeChatUrl, type ChatMessage as Message } from '@/lib/chatbot';
import ChatSources from './ChatSources';

export default function ChatMessage({ message, onRetry, retryable }: { message: Message; onRetry: () => void; retryable: boolean }) {
  return <article className={`tt-chat-message is-${message.role}`} aria-label={message.role === 'user' ? 'Câu hỏi của bạn' : 'Trợ lý AI trả lời'}>
    {message.role === 'assistant' && <ResponsiveImage profile="icon" className="tt-chat-avatar" sizes="28px" src={CHATBOT_ICON} alt="" width="28" height="28" />}
    <div className="tt-chat-message__body">
      {message.role === 'user' ? <p>{message.content}</p> : <>
        {message.content ? <div className="tt-chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
          a: ({ href, children }) => safeChatUrl(href || '') ? <a href={safeChatUrl(href!)} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
          img: ({ alt }) => <span>{alt}</span>,
          table: ({ children }) => <div className="tt-chat-table" tabIndex={0} aria-label="Bảng thông tin, cuộn ngang để xem"><table>{children}</table></div>,
        }}>{message.content}</ReactMarkdown></div> : message.status === 'streaming' && <p className="tt-chat-thinking"><span />Đang tìm hiểu câu hỏi của bạn...</p>}
        <ChatSources sources={message.sources} searchEntryPoint={message.searchEntryPoint} />
        {message.truncated && <p className="tt-chat-note">Bạn có thể hỏi tiếp để xem phần còn lại.</p>}
        {message.status === 'error' && <div className="tt-chat-error" role="alert"><p>{message.error}</p>{retryable && <button type="button" onClick={onRetry}>Thử lại</button>}</div>}
      </>}
    </div>
  </article>;
}
