"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createJurisdiction, updateJurisdiction, type JurisdictionActionState } from "@/app/(admin)/admin/settings/jurisdictions/actions";

const initialState: JurisdictionActionState = { error: null };

const SUBMISSION_METHODS = [
  { value: "online", label: "Online Portal" },
  { value: "email", label: "Email" },
  { value: "mail", label: "Mail" },
  { value: "portal", label: "Dedicated Portal" },
] as const;

const REQUIRES_FLAGS = [
  { name: "requires_coi", label: "COI" },
  { name: "requires_pe_stamp", label: "PE Stamp" },
  { name: "requires_traffic_control_plan", label: "Traffic Control Plan" },
  { name: "requires_cover_sheet", label: "Cover Sheet" },
  { name: "requires_application_form", label: "Application Form" },
] as const;

const WORKFLOW_FLAGS = [
  { name: "requires_review_before_submission", label: "Requires Review Before Submission" },
  { name: "allows_bulk_submission", label: "Allows Bulk Submission" },
] as const;

export type JurisdictionFormItem = {
  id: string;
  state: string;
  county: string | null;
  township: string | null;
  authority_name: string;
  submission_method: string | null;
  submission_url: string | null;
  submission_email: string | null;
  requires_coi: boolean;
  requires_pe_stamp: boolean;
  requires_traffic_control_plan: boolean;
  requires_cover_sheet: boolean;
  requires_application_form: boolean;
  cover_sheet_template_id: string | null;
  application_fee: number | null;
  jurisdiction_fee: number | null;
  requires_review_before_submission: boolean;
  allows_bulk_submission: boolean;
  avg_approval_days: number | null;
  notes: string | null;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function JurisdictionForm({
  item,
  cancelHref,
}: {
  item?: JurisdictionFormItem;
  cancelHref: string;
}) {
  const action = item ? updateJurisdiction : createJurisdiction;
  const [state, formAction] = useActionState(action, initialState);
  const isEdit = !!item;

  const inputCls =
    "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
  const selectCls =
    "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer";
  const labelCls = "block text-xs font-medium text-dim mb-1.5";
  const borderStyle = { border: "1px solid #d4dde4" };

  return (
    <form className="space-y-6" action={formAction}>
      {isEdit && <input type="hidden" name="id" value={item.id} />}

      {/* Location */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Location</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>
              State<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              name="state"
              type="text"
              required
              defaultValue={item?.state ?? "NJ"}
              maxLength={2}
              placeholder="NJ"
              className={inputCls}
              style={borderStyle}
            />
          </div>
          <div>
            <label className={labelCls}>County</label>
            <input
              name="county"
              type="text"
              defaultValue={item?.county ?? ""}
              placeholder="e.g. Bergen"
              className={inputCls}
              style={borderStyle}
            />
          </div>
          <div>
            <label className={labelCls}>Township / Municipality</label>
            <input
              name="township"
              type="text"
              defaultValue={item?.township ?? ""}
              placeholder="e.g. Hackensack"
              className={inputCls}
              style={borderStyle}
            />
          </div>
        </div>
      </div>

      {/* Authority */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Authority</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>
              Authority Name<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              name="authority_name"
              type="text"
              required
              defaultValue={item?.authority_name ?? ""}
              placeholder="e.g. NJDOT, Bergen County Engineering"
              className={inputCls}
              style={borderStyle}
            />
          </div>
        </div>
      </div>

      {/* Submission */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Submission</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Method</label>
            <select
              name="submission_method"
              defaultValue={item?.submission_method ?? ""}
              className={selectCls}
              style={borderStyle}
            >
              <option value="">— Select —</option>
              {SUBMISSION_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Submission URL</label>
            <input
              name="submission_url"
              type="url"
              defaultValue={item?.submission_url ?? ""}
              placeholder="https://"
              className={inputCls}
              style={borderStyle}
            />
          </div>
          <div>
            <label className={labelCls}>Submission Email</label>
            <input
              name="submission_email"
              type="email"
              defaultValue={item?.submission_email ?? ""}
              placeholder="permits@example.gov"
              className={inputCls}
              style={borderStyle}
            />
          </div>
        </div>
      </div>

      {/* Requirements */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Document Requirements</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          {REQUIRES_FLAGS.map((f) => (
            <label key={f.name} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name={f.name}
                defaultChecked={item ? (item[f.name as keyof JurisdictionFormItem] as boolean) : false}
                className="rounded"
              />
              <span className="text-sm text-dim">{f.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Fees */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Fees</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Application Fee</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
              <input
                name="application_fee"
                type="number"
                step="0.01"
                min="0"
                defaultValue={item?.application_fee ?? ""}
                placeholder="0.00"
                className="w-full bg-surface rounded-lg pl-7 pr-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
                style={borderStyle}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Jurisdiction Fee</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
              <input
                name="jurisdiction_fee"
                type="number"
                step="0.01"
                min="0"
                defaultValue={item?.jurisdiction_fee ?? ""}
                placeholder="0.00"
                className="w-full bg-surface rounded-lg pl-7 pr-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
                style={borderStyle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Workflow + Timelines */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Workflow</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            {WORKFLOW_FLAGS.map((f) => (
              <label key={f.name} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name={f.name}
                  defaultChecked={item ? (item[f.name as keyof JurisdictionFormItem] as boolean) : false}
                  className="rounded"
                />
                <span className="text-sm text-dim">{f.label}</span>
              </label>
            ))}
          </div>
          <div>
            <label className={labelCls}>Avg. Approval Days</label>
            <input
              name="avg_approval_days"
              type="number"
              min="0"
              defaultValue={item?.avg_approval_days ?? ""}
              placeholder="e.g. 30"
              className={inputCls}
              style={borderStyle}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={item?.notes ?? ""}
          placeholder="Special instructions, contacts, or anything unusual about this jurisdiction…"
          className={`${inputCls} resize-none`}
          style={borderStyle}
        />
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid #e3e9ec" }}>
        <a href={cancelHref} className="text-sm text-dim hover:text-ink transition-colors">
          Cancel
        </a>
        <SubmitButton label={isEdit ? "Save Changes" : "Create Jurisdiction"} />
      </div>
    </form>
  );
}
