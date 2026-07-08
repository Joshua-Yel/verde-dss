import React from 'react';

export default function AIPanel() {
  return (
    <aside className="w-80 border-l border-border bg-sidebar p-5 flex flex-col min-h-screen text-foreground transition-colors duration-200">
      
      {/* Header Area */}
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          {/* Subtle Sparkle / AI Graphic representation */}

          <div className="text-sm font-semibold tracking-tight">AI Companion · ARIA</div>
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
          {[
            'Why did revenue rise?', 
            'What to reorder this week?', 
            'Top 3 growth services', 
            'Explain MAPE'
          ].map((prompt) => (
            <button 
              key={prompt} 
              className="text-[11px] font-medium text-muted-foreground px-2.5 py-1.5 rounded-lg border border-border bg-card shadow-xs hover:bg-secondary hover:text-foreground hover:border-primary/20 transition-all text-left"
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
        <div className="flex-1 overflow-y-auto p-3.5 rounded-xl border border-border bg-card/60 text-xs text-muted-foreground/90 space-y-3 font-sans">
          <div className="flex gap-2">
            <span className="font-semibold text-primary select-none">ARIA:</span>
            <p className="leading-relaxed text-foreground/80">
              Hi — ask me about any forecast or data report inside this view.
            </p>
          </div>
        </div>
      </div>

      {/* Input Action Wrapper */}
      <div className="mt-4 relative flex items-center">
        <input 
          placeholder="Ask the analyst..." 
          className="w-full text-xs rounded-xl border border-input bg-card pl-3.5 pr-10 py-3 shadow-xs placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all"
        />
        <button className="absolute right-2.5 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 5v14"/></svg>
        </button>
      </div>

      {/* Footer Branding Acknowledgement */}
      <div className="text-[9px] tracking-widest text-muted-foreground/60 mt-4 uppercase font-semibold flex flex-col gap-0.5 border-t border-border/40 pt-3">
        <span>Powered by Gemini</span>
        <span className="opacity-70">Forecasts from WMA Engine</span>
      </div>

    </aside>
  );
}