import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';

export default function ChatCanvas({
  messages, activeSourceIds, isChatting, chatError,
  onSend, onAbort, onClear, onCitationClick,
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isChatting || !activeSourceIds.length) return;
    onSend(input);
    setInput('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Empty state: no sources selected
  if (!activeSourceIds.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center px-8">
          <span className="material-symbols-outlined text-4xl text-black mb-3">auto_stories</span>
          <h2 className="text-base font-semibold text-black mb-1">No sources selected</h2>
          <p className="text-xs text-black">Add study materials on the left, then come back here to ask questions.</p>
        </div>
      </div>
    );
  }

  // Empty state: no messages yet
  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center px-8">
          <span className="material-symbols-outlined text-4xl text-black mb-3">chat</span>
          <h2 className="text-base font-semibold text-black mb-1">Ask about your materials</h2>
          <p className="text-xs text-black">Type a question about your study materials and get answers grounded in your sources.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onCitationClick={onCitationClick}
          />
        ))}
        {isChatting && (
          <div className="flex justify-start mb-3">
            <div className="bg-white border border-black/8 rounded-2xl rounded-bl-md px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        {chatError && (
          <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600 mb-3">
            {chatError}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-black/8 px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your materials..."
            rows={1}
            className="flex-1 text-sm bg-white text-black placeholder:text-black border border-black/10 rounded-xl px-3.5 py-2.5 outline-none focus:border-black/25 resize-none transition-all duration-150 min-h-[38px] max-h-[200px]"
            style={{ height: 'auto', minHeight: '38px' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
          />
          {isChatting ? (
            <button
              type="button"
              onClick={onAbort}
              className="shrink-0 w-9 h-9 rounded-xl border border-black/10 flex items-center justify-center text-black hover:border-black/25 active:scale-[0.97] transition-all duration-150"
              aria-label="Stop generating"
            >
              <span className="material-symbols-outlined text-[18px]">stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center disabled:opacity-30 active:scale-[0.97] transition-all duration-150"
              aria-label="Send message"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
