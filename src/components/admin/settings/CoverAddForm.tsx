"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { addCoverTemplate, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";
import { STATES, countiesForState } from "@/lib/data/usLocations";

const initialState: SettingsActionState = { error: null };

const AUTHORITY_OPTIONS = [
  { value: "state",    label: "State" },
  { value: "county",  label: "County" },
  { value: "township", label: "Township" },
];

const WORK_TYPE_OPTIONS = [
  { value: "aerial",      label: "Aerial" },
  { value: "underground", label: "Underground" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Adding…" : "Add Template"}
    </button>
  );
}

const SELECT_CLS =
  "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

const INPUT_CLS =
  "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";

const BORDER = { border: "1px solid #d4dde4" };

export function CoverAddForm() {
  const [state, formAction] = useActionState(addCoverTemplate, initialState);
  const [selectedState, setSelectedState] = useState("");
  const [peRequired, setPeRequired]       = useState(false);
  const [formKey, setFormKey]             = useState(0);
  const [showSuccess, setShowSuccess]     = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  // When the server action succeeds, reset the form and briefly show a banner.
  useEffect(() => {
    if (!state.success) return;
    setShowSuccess(true);
    setSelectedState("");
    setPeRequired(false);
    setFormKey((k) => k + 1); // re-mounts <form>, clearing uncontrolled inputs
    if (fileInputRef.current) fileInputRef.current.value = "";
    const t = setTimeout(() => setShowSuccess(false), 3500);
    return () => clearTimeout(t);
  // state object reference changes on each action result — correct dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const counties = countiesForState(selectedState);

  return (
    <>
      {showSuccess && (
        <div className="rounded-lg bg-green-50 px-4 py-3 mb-4">
          <p className="text-sm text-green-700 font-medium">Template added — form is ready for another.</p>
        </div>
      )}
    <form key={formKey} className="space-y-5" action={formAction}>
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-dim mb-1.5">
          Template Name<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          placeholder="e.g. Burlington County Standard"
          className={`${INPUT_CLS} uppercase-input`}
          style={BORDER}
        />
      </div>

      {/* ── Match Criteria ── */}
      <div className="space-y-3.5 rounded-xl p-4" style={{ background: "#f7f9fc", border: "1px solid #e3e9ec" }}>
        {/* Header row with PE toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-ink">Match Criteria</p>
            <p className="text-[11px] text-muted mt-0.5">
              Determines which projects this template applies to.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-medium text-dim">PE Signature</span>
            <button
              type="button"
              role="switch"
              aria-checked={peRequired}
              onClick={() => setPeRequired((v) => !v)}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ background: peRequired ? "#005bc1" : "#c9d3da" }}
            >
              <span
                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: peRequired ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
            <input type="hidden" name="pe_required" value={String(peRequired)} />
          </div>
        </div>

        {/* Row 1: Authority Type + Work Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-dim mb-1">Authority Type</label>
            <select name="authority_type" className={SELECT_CLS} style={BORDER} defaultValue="">
              <option value="" disabled>Select type…</option>
              {AUTHORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-dim mb-1">Work Type</label>
            <select name="work_type" className={SELECT_CLS} style={BORDER} defaultValue="">
              <option value="" disabled>Select type…</option>
              {WORK_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: State + County */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-dim mb-1">State</label>
            <select
              name="state"
              className={SELECT_CLS}
              style={BORDER}
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
            >
              <option value="">— any state —</option>
              {STATES.map((s) => (
                <option key={s.abbr} value={s.abbr}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-dim mb-1">County</label>
            <select
              name="county"
              className={SELECT_CLS}
              style={BORDER}
              disabled={!selectedState}
              defaultValue=""
              key={selectedState}
            >
              {!selectedState ? (
                <option value="">Select a state first</option>
              ) : counties.length > 0 ? (
                <>
                  <option value="">— any county —</option>
                  {counties.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </>
              ) : (
                <option value="">No counties loaded yet</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* PDF Upload */}
      <div>
        <label className="block text-xs font-medium text-dim mb-1.5">Template File (PDF)</label>
        <input
          ref={fileInputRef}
          name="template_file"
          type="file"
          accept="application/pdf"
          className="w-full text-sm text-dim file:mr-3 file:py-1.5 file:px-3 file:rounded file:text-xs file:font-medium file:bg-surface file:text-ink file:border file:border-solid file:border-rule hover:file:bg-wash cursor-pointer"
        />
        <p className="mt-1 text-xs text-muted">PDF only, max 20 MB. Becomes the first live version.</p>
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
    </>
  );
}
