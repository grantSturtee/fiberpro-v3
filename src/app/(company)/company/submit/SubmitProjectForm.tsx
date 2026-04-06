"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AUTHORITY_TYPE_OPTIONS, US_STATES } from "@/lib/constants/authorities";
import { PLAN_TYPE_OPTIONS } from "@/lib/constants/project";
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
  options: readonly string[];
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

// Read-only system-populated field — shows a value that will be set automatically.
function SystemField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5">{label}</label>
      <div
        className="w-full bg-canvas rounded-lg px-3.5 py-2.5 text-sm text-dim"
        style={{ border: "1px solid #d4dde4" }}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ── State select ──────────────────────────────────────────────────────────────

function StateSelect() {
  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="state">
        State<span className="text-red-500 ml-0.5">*</span>
      </label>
      <select
        id="state"
        name="state"
        required
        defaultValue="NJ"
        className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
        style={{ border: "1px solid #d4dde4" }}
      >
        <option value="">Select state…</option>
        {US_STATES.map((s) => (
          <option key={s.abbr} value={s.abbr}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type SubmitProjectFormProps = {
  submitterName: string;
  companyManagerName: string | null;
};

// ── Main form ─────────────────────────────────────────────────────────────────

export function SubmitProjectForm({
  submitterName,
  companyManagerName,
}: SubmitProjectFormProps) {
  const [state, formAction, pending] = useActionState(submitProject, initialState);

  return (
    <form className="space-y-8" action={formAction}>

      {/* ── Contact & Reference ───────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Contact &amp; Reference
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/*
            Project Manager and Company Manager are system-driven:
            - Project Manager = the signed-in user submitting this form
            - Company Manager = the company admin on file for this account
            These are shown for confirmation only; values are set by the server.
          */}
          <SystemField
            label="Project Manager"
            value={submitterName}
            hint="Auto-populated from your account"
          />
          <SystemField
            label="Company Manager"
            value={companyManagerName ?? "—"}
            hint="The company admin on file for your account"
          />
          <Field
            label="Client Job Number"
            name="job_number_client"
            placeholder="e.g. JB-2026-04812"
            hint="Your internal reference number for this project"
          />
        </div>
      </fieldset>

      {/* ── Project Details ───────────────────────────────────── */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Project Details
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field
              label="Job Name"
              name="job_name"
              placeholder="e.g. Aerial Installation — Route 46 SB"
              required
            />
          </div>
          <Field
            label="Requested Approval Date"
            name="requested_approval_date"
            type="date"
            required
          />
          {/*
            Job Type here is the client-visible work classification:
            Aerial / Underground / Mixed / Other.
            This maps to type_of_plan in the DB. The internal operational
            job_type (TCP / SLD / Full Package) is set by admin after intake review.
          */}
          <SelectField
            label="Job Type"
            name="type_of_plan"
            options={PLAN_TYPE_OPTIONS}
            required
            hint="The type of work being performed"
          />
        </div>
      </fieldset>

      {/* ── Location ──────────────────────────────────────────── */}
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
            options={AUTHORITY_TYPE_OPTIONS}
            required
            hint="The type of government body issuing the permit"
          />
          <StateSelect />
          <Field
            label="County"
            name="county"
            placeholder="e.g. Bergen"
            hint="County where the work is located"
          />
          <Field
            label="City / Municipality"
            name="city"
            placeholder="e.g. Lodi"
            required
          />
          {/*
            Township is removed from the client-facing form.
            Admin can add jurisdiction detail during intake review if needed.
          */}
        </div>
      </fieldset>

      {/* ── Notes & Attachments ───────────────────────────────── */}
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

          {/* Attachment upload — TODO: wire to Supabase Storage in a later phase */}
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Attachments</label>
            <div
              className="rounded-xl px-6 py-8 text-center bg-canvas"
              style={{ border: "1.5px dashed #d4dde4" }}
            >
              <p className="text-sm font-medium text-dim mb-1">File attachments</p>
              <p className="text-xs text-muted">
                Attachment upload will be available in a future update.
                Submit your project now — attachments can be added by your FiberPro contact.
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

      {/* Actions */}
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
