"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateTCDEntry, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

const TCD_CATEGORIES = ["shoulder", "lane", "highway", "ramp", "intersection", "other"] as const;

type TcdItem = {
  id: string;
  code: string;
  title: string | null;
  description: string;
  category: string | null;
  state: string | null;
  storage_path: string | null;
  sort_order: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : "Save Changes"}
    </button>
  );
}

export function TcdEditForm({ item }: { item: TcdItem }) {
  const [state, formAction] = useActionState(updateTCDEntry, initialState);

  if (state.success) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700 font-medium">Changes saved.</p>
        </div>
        <Link href="/admin/settings/tcd" className="text-sm text-primary hover:underline">
          ← Back to TCD Library
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={formAction} encType="multipart/form-data">
      <input type="hidden" name="id" value={item.id} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">
            Code<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="code" type="text" required defaultValue={item.code}
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Title</label>
          <input name="title" type="text" defaultValue={item.title ?? ""}
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dim mb-1.5">
            Description<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="description" type="text" required defaultValue={item.description}
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Category</label>
          <select name="category" defaultValue={item.category ?? ""}
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
          <input name="state" type="text" defaultValue={item.state ?? ""} maxLength={2}
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Sort Order</label>
          <input name="sort_order" type="number" defaultValue={item.sort_order} min="0"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">
            Replace PDF {item.storage_path ? <span className="text-green-600 font-normal">(PDF on file)</span> : ""}
          </label>
          <input name="pdf_file" type="file" accept="application/pdf"
            className="w-full text-sm text-dim file:mr-3 file:py-1.5 file:px-3 file:rounded file:text-xs file:font-medium file:bg-surface file:text-ink file:border file:border-solid file:border-rule hover:file:bg-wash cursor-pointer" />
          <p className="mt-1 text-xs text-muted">Leave empty to keep existing PDF</p>
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid #e3e9ec" }}>
        <Link href="/admin/settings/tcd" className="text-sm text-dim hover:text-ink transition-colors">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
