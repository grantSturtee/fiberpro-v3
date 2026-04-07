"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addTCDEntry, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

const TCD_CATEGORIES = ["shoulder", "lane", "highway", "ramp", "intersection", "other"] as const;

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

export function TcdAddForm() {
  const [state, formAction] = useActionState(addTCDEntry, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">TCD sheet added.</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={formAction} encType="multipart/form-data">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">
            Code<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="code" type="text" required placeholder="e.g. TCD-3"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Title</label>
          <input name="title" type="text" placeholder="Short title (optional)"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dim mb-1.5">
            Description<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="description" type="text" required placeholder="e.g. 2-lane road, shoulder closure, no flaggers"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Category</label>
          <select name="category"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
            style={{ border: "1px solid #d4dde4" }}>
            <option value="">Select…</option>
            {TCD_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">State</label>
          <input name="state" type="text" placeholder="e.g. NJ" maxLength={2}
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Sort Order</label>
          <input name="sort_order" type="number" placeholder="0" defaultValue="0" min="0"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">PDF File</label>
          <input name="pdf_file" type="file" accept="application/pdf"
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
  );
}
