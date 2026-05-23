"use client";

import { useState, useRef, useEffect, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateCadence } from "./actions";
import type { SettingsActionState } from "./actions";

const CADENCE_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 2, label: "2 days" },
  { value: 3, label: "3 days" },
  { value: 4, label: "4 days" },
  { value: 5, label: "5 days" },
  { value: 6, label: "6 days" },
  { value: 7, label: "7 days" },
];

// ── Custom dropdown ───────────────────────────────────────────────────────────

function CadenceDropdown({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  const selectedLabel = CADENCE_OPTIONS.find((o) => o.value === value)?.label ?? `${value} days`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-card text-muted hover:text-ink transition-colors"
        style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
      >
        <span>{selectedLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-20 bg-card rounded-xl overflow-hidden min-w-[120px]"
          style={{ boxShadow: "0 4px 20px rgba(43,52,55,0.12)" }}
        >
          {CADENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
                opt.value === value
                  ? "bg-wash text-ink font-medium"
                  : "text-dim hover:bg-wash hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Save button ───────────────────────────────────────────────────────────────

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

export function CadenceForm({ currentDays }: { currentDays: number }) {
  const [selected, setSelected] = useState(currentDays);
  const [state, action] = useActionState<SettingsActionState, FormData>(updateCadence, { error: null });

  return (
    <form action={action} className="flex items-center gap-3">
      {/* Hidden input carries the selected value to the server action */}
      <input type="hidden" name="cadence_days" value={selected} />
      <CadenceDropdown value={selected} onChange={setSelected} />
      <SaveButton />
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
      {state.success && (
        <span className="text-xs text-green-600">Saved</span>
      )}
    </form>
  );
}
