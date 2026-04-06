"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AUTHORITY_TYPE_OPTIONS, NJ_COUNTIES } from "@/lib/constants/authorities";
import { PLAN_TYPE_OPTIONS, JOB_TYPE_OPTIONS } from "@/lib/constants/project";
import { submitProject, type SubmitProjectState } from "./actions";

const initialState: SubmitProjectState = { error: null };

// ── Form field primitives ─────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
};

function Field({ label, name, type = "text", placeholder, required, hint }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5" htmlFor={name}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
        style={{ border: "1px solid #d4dde4" }}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  options: string[];
  required?: boolean;
  hint?: string;
};

function SelectField({ label, name, options, required, hint }: SelectFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5" htmlFor={name}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
        style={{ border: "1px solid #d4dde4" }}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function SubmitProjectForm() {
  const [state, formAction, pending] = useActionState(submitProject, initialState);

  return (
    <form className="space-y-8" action={formAction}>

      {/* ── Contact / Reference ─────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Contact &amp; Reference
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Rhino PM" name="rhino_pm" placeholder="Full name" />
          <Field label="Comcast Manager" name="comcast_manager" placeholder="Full name" />
          <Field
            label="Client Job Number"
            name="job_number_client"
            placeholder="e.g. JB-2026-04812"
            hint="The JB number or client reference ID"
          />
          <Field
            label="Date Submitted to FiberPro"
            name="submitted_to_fiberpro"
            type="date"
            required
          />
        </div>
      </fieldset>

      {/* ── Project Details ──────────────────────────────────── */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Project Details
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field
              label="Job Name"
              name="job_name"
              placeholder="e.g. Comcast Aerial TCP — Rt. 46 SB"
              required
            />
          </div>
          <Field
            label="Requested Approval Date"
            name="requested_approval_date"
            type="date"
            required
          />
          <SelectField
            label="Type of Plan"
            name="type_of_plan"
            options={[...PLAN_TYPE_OPTIONS]}
            required
          />
          <SelectField
            label="Job Type"
            name="job_type"
            options={[...JOB_TYPE_OPTIONS]}
            required
          />
        </div>
      </fieldset>

      {/* ── Location ─────────────────────────────────────────── */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Location
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field
              label="Job Address / Route"
              name="job_address"
              placeholder="e.g. Route 46 SB, Lodi, NJ 07644"
              required
            />
          </div>
          <SelectField
            label="Authority Type"
            name="authority_type"
            options={[...AUTHORITY_TYPE_OPTIONS]}
            required
            hint="The type of government body issuing the permit"
          />
          <SelectField
            label="County"
            name="county"
            options={[...NJ_COUNTIES]}
            required
          />
          <Field label="City / Municipality" name="city" placeholder="e.g. Lodi" required />
          <Field label="Township / Borough" name="township" placeholder="e.g. Lodi Borough" />
        </div>
      </fieldset>

      {/* ── Notes ────────────────────────────────────────────── */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Notes &amp; Attachments
        </legend>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Notes</label>
            <textarea
              name="notes"
              rows={4}
              className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                         outline-none resize-none transition-shadow focus:ring-2 focus:ring-primary/20"
              style={{ border: "1px solid #d4dde4" }}
              placeholder="Describe the work scope, any special considerations, milepost range, etc."
            />
          </div>

          {/* Attachment upload — TODO: wire to Supabase Storage (file uploads are a later phase) */}
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Attachments</label>
            <div
              className="border-2 border-dashed rounded-xl px-6 py-10 text-center"
              style={{ borderColor: "#d4dde4" }}
            >
              <p className="text-sm font-medium text-ink mb-1">File uploads coming soon</p>
              <p className="text-xs text-muted">
                Attachment upload will be available in a future update.
                Submit your project now and attach files once available.
              </p>
            </div>
          </div>
        </div>
      </fieldset>

      {/* Error display */}
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      {/* Submit */}
      <div
        className="flex items-center justify-between gap-4 pt-4"
        style={{ borderTop: "1px solid #e3e9ec" }}
      >
        <Link href="/company" className="text-sm text-dim hover:text-ink transition-colors">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          {pending ? "Submitting…" : "Submit Project"}
        </button>
      </div>
    </form>
  );
}
