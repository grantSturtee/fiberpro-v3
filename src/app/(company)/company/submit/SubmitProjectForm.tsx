"use client";

import { useMemo } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AUTHORITY_TYPE_OPTIONS, US_STATES } from "@/lib/constants/authorities";
import { PLAN_TYPE_OPTIONS } from "@/lib/constants/project";
import { submitProject, type SubmitProjectState } from "./actions";

const initialState: SubmitProjectState = { error: null };

// ── Public types ──────────────────────────────────────────────────────────────

export type CompanyRole = "company_admin" | "project_manager";

export type CompanyMember = {
  userId: string;
  displayName: string | null;
  email: string | null;
  label: string;
};

// ── Form field primitives ─────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  uppercase?: boolean;
};

function Field({ label, name, type = "text", placeholder, required, hint, uppercase }: FieldProps) {
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
        className={`w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20${uppercase ? " uppercase-input" : ""}`}
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

function MemberSelect({
  label,
  name,
  members,
  defaultValue,
  emptyLabel,
  selectPlaceholder,
  hint,
  visualRequired = false,
}: {
  label: string;
  name: string;
  members: CompanyMember[];
  defaultValue?: string;
  emptyLabel: string;
  selectPlaceholder?: string;
  hint?: string;
  visualRequired?: boolean;
}) {
  const placeholder =
    members.length === 0
      ? emptyLabel
      : selectPlaceholder ?? "Select…";
  const resetKey = useMemo(
    () => members.map((m) => m.userId).join("|") + "::" + (defaultValue ?? ""),
    [members, defaultValue]
  );
  const disabled = members.length === 0;
  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5" htmlFor={name}>
        {label}
        {visualRequired && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        key={resetKey}
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer
                   disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ border: "1px solid #d4dde4" }}
      >
        <option value="">{placeholder}</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>{m.label}</option>
        ))}
      </select>
      {disabled && (
        <p className="mt-1 text-xs text-amber-700">{emptyLabel}</p>
      )}
      {!disabled && hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ── State select ──────────────────────────────────────────────────────────────

function StateSelect({ allowedStates }: { allowedStates: string[] | null }) {
  const configured = allowedStates !== null && allowedStates.length > 0;

  if (!configured) {
    return (
      <div>
        <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="state">
          State<span className="text-red-500 ml-0.5">*</span>
        </label>
        <div
          className="w-full bg-canvas rounded-lg px-3.5 py-2.5 text-sm text-muted"
          style={{ border: "1px solid #d4dde4" }}
        >
          No states available
        </div>
      </div>
    );
  }

  const stateOptions = US_STATES.filter((s) => allowedStates.includes(s.abbr));
  const defaultState = stateOptions.find((s) => s.abbr === "NJ")
    ? "NJ"
    : (stateOptions[0]?.abbr ?? "");

  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="state">
        State<span className="text-red-500 ml-0.5">*</span>
      </label>
      <select
        id="state"
        name="state"
        required
        defaultValue={defaultState}
        className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
        style={{ border: "1px solid #d4dde4" }}
      >
        <option value="">Select state…</option>
        {stateOptions.map((s) => (
          <option key={s.abbr} value={s.abbr}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Role-aware contact section ────────────────────────────────────────────────

function ContactsSection({
  role,
  currentUserLabel,
  projectManagers,
}: {
  role: CompanyRole;
  currentUserLabel: string;
  projectManagers: CompanyMember[];
}) {
  if (role === "project_manager") {
    // Server derives PM from membership — no form input needed.
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SystemField
          label="Project Manager"
          value={currentUserLabel}
          hint="Auto-populated from your account"
        />
      </div>
    );
  }

  // company_admin: full PM dropdown.
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <MemberSelect
        label="Project Manager"
        name="project_manager_id"
        members={projectManagers}
        selectPlaceholder="Select Project Manager"
        emptyLabel="No project managers in this company."
        visualRequired
      />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type SubmitProjectFormProps = {
  role: CompanyRole;
  currentUserLabel: string;
  projectManagers: CompanyMember[];
  allowedStates: string[] | null;
};

// ── Main form ─────────────────────────────────────────────────────────────────

export function SubmitProjectForm({
  role,
  currentUserLabel,
  projectManagers,
  allowedStates,
}: SubmitProjectFormProps) {
  const [state, formAction, pending] = useActionState(submitProject, initialState);

  const noStatesConfigured = !allowedStates || allowedStates.length === 0;

  return (
    <form className="space-y-8" action={formAction}>

      {noStatesConfigured && (
        <div className="rounded-lg px-4 py-3" style={{ background: "#fffbe6", border: "1px solid #f0d080" }}>
          <p className="text-sm font-medium" style={{ color: "#7a5800" }}>
            This company is not configured to create projects in any state.
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#9a7010" }}>
            Contact your administrator to enable project submissions.
          </p>
        </div>
      )}

      {/* ── Contact & Reference ───────────────────────────────── */}
      <fieldset>
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Contact &amp; Reference
        </legend>

        <ContactsSection
          role={role}
          currentUserLabel={currentUserLabel}
          projectManagers={projectManagers}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
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
          <Field
            label="Requested Approval Date"
            name="requested_approval_date"
            type="date"
            required
          />
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
              label="Street Address"
              name="street_address"
              placeholder="e.g. 123 Main St"
              required
              uppercase
            />
          </div>
          <Field
            label="City / Municipality"
            name="city"
            placeholder="e.g. Lodi"
            required
            uppercase
          />
          <StateSelect allowedStates={allowedStates} />
          <Field
            label="ZIP Code"
            name="zip_code"
            placeholder="e.g. 07644"
            hint="Optional"
            uppercase
          />
          <Field
            label="County"
            name="county"
            placeholder="e.g. Bergen"
            hint="County where the work is located"
            uppercase
          />
          <SelectField
            label="Authority Type"
            name="authority_type"
            options={AUTHORITY_TYPE_OPTIONS}
            required
            hint="The type of government body issuing the permit"
          />
          <Field
            label="Milepost Start"
            name="milepost_start"
            placeholder="e.g. 14.3"
            hint="Starting milepost of the work area (optional)"
            uppercase
          />
          <Field
            label="Milepost End"
            name="milepost_end"
            placeholder="e.g. 16.8"
            hint="Ending milepost of the work area (optional)"
            uppercase
          />
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

          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Attachments</label>
            <div
              className="rounded-xl px-6 py-5 bg-canvas"
              style={{ border: "1.5px dashed #d4dde4" }}
            >
              <p className="text-sm font-medium text-dim mb-1">Upload after submitting</p>
              <p className="text-xs text-muted">
                Reference files (PDFs) can be uploaded from the project detail page once your project has been submitted.
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
          disabled={pending || noStatesConfigured}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          {pending ? "Submitting…" : "Submit Project"}
        </button>
      </div>
    </form>
  );
}
