"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AUTHORITY_TYPE_OPTIONS, US_STATES } from "@/lib/constants/authorities";
import { PLAN_TYPE_OPTIONS, JOB_TYPE_OPTIONS } from "@/lib/constants/project";
import { createAdminProject, type NewProjectState } from "./actions";

const initialState: NewProjectState = { error: null };

// ── Field primitives ──────────────────────────────────────────────────────────

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  defaultValue?: string;
}) {
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
        defaultValue={defaultValue}
        className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
        style={{ border: "1px solid #d4dde4" }}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
  hint,
}: {
  label: string;
  name: string;
  options: readonly string[];
  required?: boolean;
  hint?: string;
}) {
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Creating…" : "Create Project"}
    </button>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

type Company = { id: string; name: string };

export function NewProjectForm({ companies }: { companies: Company[] }) {
  const [state, formAction] = useActionState(createAdminProject, initialState);

  return (
    <form className="space-y-8" action={formAction}>

      {/* ── Company ───────────────────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Client
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="company_id">
              Company<span className="text-red-500 ml-0.5">*</span>
            </label>
            <select
              id="company_id"
              name="company_id"
              required
              className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                         outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
              style={{ border: "1px solid #d4dde4" }}
            >
              <option value="">Select a company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Field label="FiberPro PM" name="rhino_pm" placeholder="e.g. Jane Smith" hint="Internal project manager" />
          <Field label="Client Manager" name="comcast_manager" placeholder="e.g. John Doe" hint="Client-side contact name" />
          <Field label="Client Job Number" name="job_number_client" placeholder="e.g. JB-2026-04812" hint="Client's internal reference" />
        </div>
      </fieldset>

      {/* ── Project Details ───────────────────────────────────── */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Project Details
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Job Name" name="job_name" placeholder="e.g. Aerial Installation — Route 46 SB" required />
          </div>
          <Field label="Requested Approval Date" name="requested_approval_date" type="date" />
          <SelectField
            label="Plan Type"
            name="type_of_plan"
            options={PLAN_TYPE_OPTIONS}
            required
            hint="Aerial / Underground / Mixed"
          />
          <SelectField
            label="Job Type"
            name="job_type"
            options={JOB_TYPE_OPTIONS}
            hint="TCP / SLD / Full Package"
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
            <Field label="Job Address / Route" name="job_address" placeholder="e.g. Route 46 SB, Lodi, NJ 07644" required />
          </div>
          <SelectField label="Authority Type" name="authority_type" options={AUTHORITY_TYPE_OPTIONS} required hint="Permit-issuing authority" />
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="state">
              State
            </label>
            <select
              id="state"
              name="state"
              defaultValue="NJ"
              className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                         outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
              style={{ border: "1px solid #d4dde4" }}
            >
              <option value="">Select state…</option>
              {US_STATES.map((s) => (
                <option key={s.abbr} value={s.abbr}>{s.name}</option>
              ))}
            </select>
          </div>
          <Field label="County" name="county" placeholder="e.g. Bergen" />
          <Field label="City / Municipality" name="city" placeholder="e.g. Lodi" required />
        </div>
      </fieldset>

      {/* ── Notes ─────────────────────────────────────────────── */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Notes
        </legend>
        <textarea
          name="notes"
          rows={4}
          className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                     outline-none resize-none transition-shadow focus:ring-2 focus:ring-primary/20"
          style={{ border: "1px solid #d4dde4" }}
          placeholder="Work scope, special considerations, milepost range, etc."
        />
      </fieldset>

      {/* Error */}
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
        <Link href="/admin/projects" className="text-sm text-dim hover:text-ink transition-colors">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
