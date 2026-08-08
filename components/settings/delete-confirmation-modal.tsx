"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type ResetAction = "operational" | "forecast" | "everything";

export type DeleteConfirmationConfig = {
  action: ResetAction;
  title: string;
  description: string;
  /** Phrase the user must type to enable confirm (e.g. CLEAR or RESET). */
  confirmPhrase: string;
  confirmLabel: string;
};

type DeleteConfirmationModalProps = {
  open: boolean;
  config: DeleteConfirmationConfig | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (action: ResetAction) => void;
};

export function DeleteConfirmationModal({
  open,
  config,
  busy = false,
  onCancel,
  onConfirm,
}: DeleteConfirmationModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, config?.action]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open || !config) return null;

  const phraseOk = typed.trim().toUpperCase() === config.confirmPhrase.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {config.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{config.description}</p>

        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Catalog tables (services, inventory items), roles, and forecasting settings are kept. This only
          removes transactional history for the current business.
        </div>

        <label className="mt-4 block space-y-1.5 text-sm">
          <span className="text-muted-foreground">
            Type <span className="font-mono font-medium text-foreground">{config.confirmPhrase}</span> to
            confirm
          </span>
          <input
            ref={inputRef}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-foreground/40"
            placeholder={config.confirmPhrase}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!phraseOk || busy}
            onClick={() => onConfirm(config.action)}
          >
            {busy ? "Working…" : config.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const RESET_MODAL_CONFIG: Record<ResetAction, DeleteConfirmationConfig> = {
  operational: {
    action: "operational",
    title: "Clear operational data?",
    description:
      "Deletes daily operations, imports, expenses, and related movement records for this business.",
    confirmPhrase: "CLEAR",
    confirmLabel: "Clear operational data",
  },
  forecast: {
    action: "forecast",
    title: "Clear forecast snapshots?",
    description: "Deletes stored forecast snapshot rows. Live forecasts can be regenerated from remaining history.",
    confirmPhrase: "CLEAR",
    confirmLabel: "Clear forecasts",
  },
  everything: {
    action: "everything",
    title: "Reset transactional data?",
    description:
      "Clears operational history and forecast snapshots. Business profile, member roles, and catalog stay in place.",
    confirmPhrase: "RESET",
    confirmLabel: "Reset transactional data",
  },
};