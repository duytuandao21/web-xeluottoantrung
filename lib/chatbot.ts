export const CHATBOT_ICON = '/images/chatbot/chatbot-icon.lossless-v1.webp';
export type ChatSource = { title: string; url: string };
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; sources?: ChatSource[]; searchEntryPoint?: string; status: 'streaming' | 'done' | 'error'; error?: string; truncated?: boolean };
export type ChatHistory = { role: 'user' | 'assistant'; content: string }[];
export type ChatEvent = { event: 'content'; text: string } | { event: 'sources'; sources: ChatSource[]; searchEntryPoint?: string } | { event: 'done'; truncated: boolean };
const unavailable = 'Xin lỗi, trợ lý AI đang tạm thời không thể phản hồi. Vui lòng thử lại sau.';
const providerLimit = 'Trợ lý AI hiện đang đạt giới hạn sử dụng. Vui lòng thử lại sau.';

export function safeChatUrl(value: string): string | undefined {
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch { /* Invalid URL. */ }
}
export function chatHistory(messages: ChatMessage[]): ChatHistory {
  const history: ChatHistory = [];
  let size = 0;
  for (let index = messages.length - 1; index > 0; index -= 2) {
    const assistant = messages[index]; const user = messages[index - 1];
    if (assistant.role !== 'assistant' || assistant.status !== 'done' || user.role !== 'user') continue;
    const answer = assistant.content.slice(0, 8000);
    if (history.length >= 16 || size + user.content.length + answer.length > 20000) break;
    size += user.content.length + answer.length;
    history.unshift({ role: 'user', content: user.content }, { role: 'assistant', content: answer });
  }
  return history;
}

export async function streamChat(message: string, history: ChatHistory, signal: AbortSignal, receive: (event: ChatEvent) => void): Promise<void> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 80000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch('/api/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message, history }), signal: AbortSignal.any([signal, timeout.signal]), cache: 'no-store' });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as { code?: string };
      throw new Error(response.status === 429 ? 'Bạn đã gửi khá nhiều câu hỏi trong thời gian ngắn. Vui lòng thử lại sau ít phút.'
        : response.status === 400 || response.status === 413 ? 'Câu hỏi hoặc lịch sử quá dài. Hãy rút gọn và thử lại.'
          : failure.code === 'AI_RATE_LIMIT' ? providerLimit : response.status === 504 ? 'Trợ lý AI phản hồi quá lâu. Vui lòng thử lại.' : unavailable);
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error(unavailable);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = ''; let event = ''; let data: string[] = []; let completed = false;
    const dispatch = () => {
      if (!data.length) { event = ''; return; }
      const value = JSON.parse(data.join('\n')) as Record<string, unknown>;
      if (event === 'error') throw new Error(value.code === 'timeout' || value.code === 'AI_TIMEOUT' ? 'Trợ lý AI phản hồi quá lâu. Vui lòng thử lại.' : value.code === 'AI_RATE_LIMIT' ? providerLimit : unavailable);
      if (event === 'content' && typeof value.text === 'string') receive({ event: 'content', text: value.text });
      if (event === 'sources') {
        const sources = (Array.isArray(value.sources) ? value.sources : []).filter((source): source is ChatSource =>
          source && typeof source.title === 'string' && typeof source.url === 'string' && Boolean(safeChatUrl(source.url))).slice(0, 20);
        receive({ event: 'sources', sources, searchEntryPoint: typeof value.searchEntryPoint === 'string' && value.searchEntryPoint.length <= 30000 ? value.searchEntryPoint : undefined });
      }
      if (event === 'done') { completed = true; receive({ event: 'done', truncated: value.truncated === true }); }
      event = ''; data = [];
    };
    while (!completed) {
      const chunk = await reader.read();
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (pending.length + data.join('\n').length > 131072) throw new Error(unavailable);
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, ''); pending = pending.slice(newline + 1);
        if (!line) dispatch();
        else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (completed) return;
      if (chunk.done) throw new Error('Phản hồi bị gián đoạn. Bạn có thể thử lại.');
    }
  } catch (error) {
    if (signal.aborted) throw new Error('Phản hồi đã dừng. Bạn có thể thử lại.');
    if (timeout.signal.aborted) throw new Error('Trợ lý AI phản hồi quá lâu. Vui lòng thử lại.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error(unavailable);
    throw error;
  } finally { clearTimeout(timer); await reader?.cancel().catch(() => undefined); reader?.releaseLock(); }
}
