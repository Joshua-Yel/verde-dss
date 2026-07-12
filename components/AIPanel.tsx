"use client";

import React, { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

const QUICK_PROMPTS = [
  'Why did revenue rise?',
  'What to reorder this week?',
  'Top 3 growth services',
  'Explain MAPE',
];

export default function AIPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/aira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Something went wrong. Please try again.');
        return;
      }

      setMessages((prev) => [...prev, { role: 'model', content: data.reply }]);
    } catch {
      setError('Could not reach the AI service. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <aside className="w-80 border-l border-border bg-sidebar p-5 flex flex-col min-h-screen text-foreground transition-colors duration-200">

      {/* Header Area */}
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold tracking-tight">AI Companion · Aira</div>
        </div>
        <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-primary">Online</span>
        </div>
      </div>

      {/* Insight Section */}
      <div className="mt-5 p-4 rounded-xl border border-border bg-card shadow-sm group hover:border-primary/30 transition-all duration-200">
        <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h10"/><path d="M9 4v16"/><path d="m3 9 3 3-3 3"/><path d="M14 12h8"/><path d="m21 9-3 3 3 3"/></svg>
          Insight
        </div>
        <div className="text-xs leading-relaxed text-foreground/90 mt-2.5">
          WMA ($n=3$) projects modest growth next month; prioritize <span className="font-semibold text-primary">Gel Manicure</span> inventory.
        </div>
      </div>

      {/* Suggested Quick Prompts */}
      <div className="mt-5">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => sendMessage(prompt)}
              className="text-[11px] font-medium text-muted-foreground px-2.5 py-1.5 rounded-lg border border-border bg-card shadow-xs hover:bg-secondary hover:text-foreground hover:border-primary/20 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area Section */}
      <div className="mt-6 flex-1 flex flex-col min-h-[220px]">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-2 flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Conversation History
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3.5 rounded-xl border border-border bg-card/60 text-xs text-muted-foreground/90 space-y-3 font-sans"
        >
          {messages.length === 0 ? (
            <div className="flex gap-2">
              <span className="font-semibold text-primary select-none">Aira:</span>
              <p className="leading-relaxed text-foreground/80">
                Hi — ask me about any forecast or data report inside this view.
              </p>
            </div>
          ) : (
            messages.map((message, i) => (
              <div key={i} className="flex gap-2">
                <span className={`font-semibold select-none shrink-0 ${message.role === 'model' ? 'text-primary' : 'text-foreground/70'}`}>
                  {message.role === 'model' ? 'Aira:' : 'You:'}
                </span>
                <p className="leading-relaxed text-foreground/80 whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-2">
              <span className="font-semibold text-primary select-none">Aira:</span>
              <span className="flex items-center gap-1 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" />
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-2 px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/10 text-[11px] text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Input Action Wrapper */}
      <form onSubmit={handleSubmit} className="mt-4 relative flex items-center">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Ask the analyst..."
          className="w-full text-xs rounded-xl border border-input bg-card pl-3.5 pr-10 py-3 shadow-xs placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="absolute right-2.5 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 5v14"/></svg>
        </button>
      </form>

      {/* Footer Branding Acknowledgement */}
      <div className="text-[9px] tracking-widest text-muted-foreground/60 mt-4 uppercase font-semibold flex flex-col gap-0.5 border-t border-border/40 pt-3">
        <span>Powered by Gemini</span>
        <span className="opacity-70">Forecasts from WMA Engine</span>
      </div>

    </aside>
  );
}