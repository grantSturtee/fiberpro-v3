"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addCoverTemplate, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

const AUTHORITY_OPTIONS = [
  { value: "county", label: "County" },
  { value: "njdot", label: "NJDOT (State)" },
  { value: "municipal", label: "Municipal" },
  { value: "other", label: "Other" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}>
      {pending ? "Adding…" : "Add Template"}
    </button>
  );
}

export function CoverAddForm() {
  const [state, formAction] = useActionState(addCoverTemplate, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">Template added.</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={formAction} encType="multipart/form-data">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dim mb-1.5">
            Template Name<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="name" type="text" required placeholder="e.g. Bergen County Standard"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Authority Type</label>
          <select name="authority_type"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
            style={{ border: "1px solid #d4dde4" }}>
            <option value="">Any</option>
            {AUTHORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">County</label>
          <input name="county" type="text" placeholder="e.g. Bergen"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">State</label>
          <input name="state" type="text" placeholder="e.g. NJ" maxLength={2}
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Work Type</label>
          <input name="work_type" type="text" placeholder="e.g. Aerial, Underground"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dim mb-1.5">Notes</label>
          <textarea name="notes" rows={2} placeholder="Internal notes about this template…"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none resize-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Template File (PDF)</label>
          <input name="template_file" type="file" accept="application/pdf"
            className="w-full text-sm text-dim file:mr-3 file:py-1.5 file:px-3 file:rounded file:text-xs file:font-medium file:bg-surface file:text-ink file:border file:border-solid file:border-rule hover:file:bg-wash cursor-pointer" />
          <p className="mt-1 text-xs text-muted">PDF only, max 20 MB</p>
        </div>
        <div className="flex items-center gap-3 pt-5">
          <input type="checkbox" name="is_default" value="true" id="ct-default"
            className="rounded" />
          <label htmlFor="ct-default" className="text-sm text-dim cursor-pointer">
            Set as default template
          </label>
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
  );
}
