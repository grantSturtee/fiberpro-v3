"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addPricingRule, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

const JOB_TYPE_OPTIONS = [
  { value: "tcp", label: "TCP" },
  { value: "sld", label: "SLD" },
  { value: "full_package", label: "Full Package" },
  { value: "revision", label: "Revision" },
  { value: "other", label: "Other" },
];

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
      {pending ? "Adding…" : "Add Rule"}
    </button>
  );
}

function DollarInput({ name, placeholder }: { name: string; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
      <input
        name={name}
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder ?? "0.00"}
        className="w-full bg-surface rounded-lg pl-7 pr-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
        style={{ border: "1px solid #d4dde4" }}
      />
    </div>
  );
}

export function PricingAddForm() {
  const [state, formAction] = useActionState(addPricingRule, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">Rule added.</p>
      </div>
    );
  }

  return (
    <form className="space-y-5" action={formAction}>
      {/* Identification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dim mb-1.5">
            Rule Label<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input name="label" type="text" required placeholder="e.g. Bergen County TCP Base"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Job Type</label>
          <select name="job_type"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
            style={{ border: "1px solid #d4dde4" }}>
            <option value="">Any</option>
            {JOB_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
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
          <label className="block text-xs font-medium text-dim mb-1.5">State</label>
          <input name="state" type="text" placeholder="e.g. NJ" maxLength={2}
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">County</label>
          <input name="county" type="text" placeholder="e.g. Bergen"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">Municipality</label>
          <input name="municipality" type="text" placeholder="e.g. Hackensack"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }} />
        </div>
      </div>

      {/* Fee schedule */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Fee Schedule</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Base Amount</label>
            <DollarInput name="base_amount" />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Per Sheet</label>
            <DollarInput name="per_sheet" />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Application Fee</label>
            <DollarInput name="application_fee" />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Jurisdiction Fee</label>
            <DollarInput name="jurisdiction_fee" />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">PE Fee</label>
            <DollarInput name="pe_fee" />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">COI Fee</label>
            <DollarInput name="coi_fee" />
          </div>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Rush Fee</label>
            <DollarInput name="rush_fee" />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-dim mb-1.5">Notes</label>
        <textarea name="notes" rows={2} placeholder="Internal notes about this rule…"
          className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none resize-none transition-shadow focus:ring-2 focus:ring-primary/20"
          style={{ border: "1px solid #d4dde4" }} />
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
