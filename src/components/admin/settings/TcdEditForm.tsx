"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateTCDEntry, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

const TCD_CATEGORIES = ["shoulder", "lane", "highway", "ramp", "intersection", "other"] as const;

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

type TcdItem = {
  id: string;
  code: string;
  description: string;
  category: string | null;
  state: string | null;
  storage_path: string | null;
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

  const inputCls = "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
  const selectCls = "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer";
  const borderStyle = { border: "1px solid #d4dde4" };

  return (
    <form className="space-y-4" action={formAction}>
      <input type="hidden" name="id" value={item.id} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">
            Code<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="code" type="text" required defaultValue={item.code}
            className={inputCls} style={borderStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Category</label>
          <select name="category" defaultValue={item.category ?? ""}
            className={selectCls} style={borderStyle}>
            <option value="">Select…</option>
            {TCD_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dim mb-1.5">
            Description<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="description" type="text" required defaultValue={item.description}
            className={inputCls} style={borderStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">State</label>
          <select name="state" defaultValue={item.state ?? ""}
            className={selectCls} style={borderStyle}>
            <option value="">Any / All States</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">
            Replace PDF{" "}
            {item.storage_path && <span className="text-green-600 font-normal">(PDF on file)</span>}
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
