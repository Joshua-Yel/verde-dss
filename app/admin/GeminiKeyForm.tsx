'use client';

import { useState } from 'react';

export default function GeminiKeyForm({
  initialConfigured,
  initialMaskedKey,
}: {
  initialConfigured: boolean;
  initialMaskedKey: string | null;
}) {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configured, setConfigured] = useState(initialConfigured);
  const [maskedKey, setMaskedKey] = useState(initialMaskedKey);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setStatus('saving');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const body = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(body.error || 'Could not save the key.');
        return;
      }

      setConfigured(true);
      setMaskedKey(body.maskedKey);
      setApiKey(''); // clear the field — never keep the raw key in memory longer than needed
      setStatus('idle');
    } catch {
      setStatus('error');
      setErrorMsg('Network error — please try again.');
    }
  };

  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
      <div className="pb-3 border-b border-border/40">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Gemini API Key</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Used by AIRA to answer questions. Stored encrypted — never shown in full once saved.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        <span className="text-muted-foreground">
          {configured ? `Connected — ${maskedKey}` : 'Not configured yet'}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your Gemini API key"
          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm"
        />
        <button
          onClick={handleSave}
          disabled={status === 'saving' || !apiKey.trim()}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {status === 'saving' ? 'Validating…' : 'Save key'}
        </button>
      </div>

      {status === 'error' && errorMsg && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      <p className="text-[10px] text-muted-foreground">
        We test the key against Google before saving it — an invalid key is rejected, not stored.
      </p>
    </div>
  );
}