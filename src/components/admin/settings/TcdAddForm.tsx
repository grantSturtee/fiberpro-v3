"use client";

import { useActionState, useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addTCDEntry, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "DC" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
] as const;

// ── Custom state dropdown ─────────────────────────────────────────────────────

function StateDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const found = US_STATES.find((s) => s.code === value);
  const selectedLabel = value && found ? `${found.code} — ${found.name}` : "Any / All States";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink transition-shadow hover:bg-wash"
        style={{ border: "1px solid #d4dde4" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 text-left truncate">{selectedLabel}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden
          className={`transition-transform flex-shrink-0 text-muted ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full left-0 mt-1 z-20 bg-card rounded-xl overflow-y-auto min-w-full"
          style={{ boxShadow: "0 4px 20px rgba(43,52,55,0.12)", maxHeight: "14rem" }}
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
              value === "" ? "bg-wash text-ink font-medium" : "text-dim hover:bg-wash hover:text-ink"
            }`}
          >
            Any / All States
          </button>
          {US_STATES.map((s) => (
            <button
              key={s.code}
              type="button"
              role="option"
              aria-selected={s.code === value}
              onClick={() => { onChange(s.code); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                s.code === value ? "bg-wash text-ink font-medium" : "text-dim hover:bg-wash hover:text-ink"
              }`}
            >
              {s.code} — {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Adding…" : "Add Sheet"}
    </button>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

export function TcdAddForm() {
  const [state, formAction] = useActionState(addTCDEntry, initialState);
  const [stateValue, setStateValue] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    setStateValue("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowSuccess(true);
    const t = setTimeout(() => setShowSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCls = "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
  const borderStyle = { border: "1px solid #d4dde4" };

  return (
    <div className="space-y-4">
      <form ref={formRef} className="space-y-4" action={formAction}>
        {/* Hidden input carries controlled state value to server action */}
        <input type="hidden" name="state" value={stateValue} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">
              Code<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input name="code" type="text" required placeholder="e.g. TCD-3"
              className={`${inputCls} uppercase-input`} style={borderStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">State</label>
            <StateDropdown value={stateValue} onChange={setStateValue} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-dim mb-1.5">
              Description<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input name="description" type="text" required placeholder="e.g. 2-lane road, shoulder closure, no flaggers"
              className={inputCls} style={borderStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">PDF File</label>
            <input
              ref={fileInputRef}
              name="pdf_file" type="file" accept="application/pdf"
              className="w-full text-sm text-dim file:mr-3 file:py-1.5 file:px-3 file:rounded file:text-xs file:font-medium file:bg-surface file:text-ink file:border file:border-solid file:border-rule hover:file:bg-wash cursor-pointer" />
            <p className="mt-1 text-xs text-muted">PDF only, max 20 MB</p>
          </div>
        </div>

        {state.error && (
          <div className="rounded-lg bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>

      {showSuccess && (
        <div className="rounded-lg bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700 font-medium">TCD sheet added.</p>
        </div>
      )}
    </div>
  );
}
