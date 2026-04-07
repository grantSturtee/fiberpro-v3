"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addJurisdiction, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

const AUTHORITY_OPTIONS = [
  { value: "county", label: "County" },
  { value: "njdot", label: "NJDOT (State)" },
  { value: "municipal", label: "Municipal" },
  { value: "other", label: "Other" },
];

const SUBMISSION_METHOD_OPTIONS = [
  { value: "online", label: "Online Portal" },
  { value: "email", label: "Email" },
  { value: "mail", label: "Mail" },
  { value: "in_person", label: "In Person" },
];

const REQUIRES_FLAGS = [
  { name: "requires_application_form", label: "Application Form" },
  { name: "requires_cover_sheet", label: "Cover Sheet" },
  { name: "requires_tcp", label: "TCP" },
  { name: "requires_sld", label: "SLD" },
  { name: "requires_tcd", label: "TCD" },
  { name: "requires_coi", label: "COI" },
  { name: "requires_pe", label: "PE Stamp" },
  { name: "requires_payment_upfront", label: "Payment Upfront" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}>
      {pending ? "Adding…" : "Add Jurisdiction"}
    </button>
  );
}

export function JurisdictionAddForm() {
  const [state, formAction] = useActionState(addJurisdiction, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">Jurisdiction added.</p>
      </div>
    );
  }

  const inputCls = "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
  const selectCls = "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer";
  const borderStyle = { border: "1px solid #d4dde4" };
  const labelCls = "block text-xs font-medium text-dim mb-1.5";

  return (
    <form className="space-y-5" action={formAction}>
      {/* Location */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>State<span className="text-red-500 ml-0.5">*</span></label>
          <input name="state" type="text" required defaultValue="NJ" maxLength={2}
            className={inputCls} style={borderStyle} />
        </div>
        <div>
          <label className={labelCls}>County</label>
          <input name="county" type="text" placeholder="e.g. Bergen"
            className={inputCls} style={borderStyle} />
        </div>
        <div>
          <label className={labelCls}>Municipality</label>
          <input name="municipality" type="text" placeholder="e.g. Hackensack"
            className={inputCls} style={borderStyle} />
        </div>
      </div>

      {/* Authority */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Authority Name</label>
          <input name="authority_name" type="text" placeholder="e.g. Bergen County Engineering"
            className={inputCls} style={borderStyle} />
        </div>
        <div>
          <label className={labelCls}>Authority Type</label>
          <select name="authority_type" className={selectCls} style={borderStyle}>
            <option value="">— Select —</option>
            {AUTHORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Submission */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Submission Method</label>
          <select name="submission_method" className={selectCls} style={borderStyle}>
            <option value="">— Select —</option>
            {SUBMISSION_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Submission URL</label>
          <input name="submission_url" type="url" placeholder="https://"
            className={inputCls} style={borderStyle} />
        </div>
        <div>
          <label className={labelCls}>Submission Email</label>
          <input name="submission_email" type="email" placeholder="permits@example.gov"
            className={inputCls} style={borderStyle} />
        </div>
        <div>
          <label className={labelCls}>Mailing Address</label>
          <input name="mailing_address" type="text" placeholder="123 Main St, Hackensack NJ 07601"
            className={inputCls} style={borderStyle} />
        </div>
      </div>

      {/* Requirements */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Requirements</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5">
          {REQUIRES_FLAGS.map((flag) => (
            <label key={flag.name} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name={flag.name} className="rounded" />
              <span className="text-sm text-dim">{flag.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { name: "payment_method_notes", label: "Payment Method Notes", placeholder: "Check, money order, credit card…" },
          { name: "turnaround_notes", label: "Turnaround Notes", placeholder: "Typical review time…" },
          { name: "special_instructions", label: "Special Instructions", placeholder: "Any unusual requirements…" },
          { name: "billing_impact_notes", label: "Billing Impact Notes", placeholder: "How fees affect billing…" },
          { name: "package_impact_notes", label: "Package Impact Notes", placeholder: "How this affects deliverables…" },
        ].map((field) => (
          <div key={field.name} className={field.name === "special_instructions" ? "sm:col-span-2" : ""}>
            <label className={labelCls}>{field.label}</label>
            <textarea name={field.name} rows={2} placeholder={field.placeholder}
              className={`${inputCls} resize-none`} style={borderStyle} />
          </div>
        ))}
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
