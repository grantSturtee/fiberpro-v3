"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AUTHORITY_TYPE_OPTIONS, US_STATES } from "@/lib/constants/authorities";
import { PLAN_TYPE_OPTIONS } from "@/lib/constants/project";
import { STATE_COUNTIES } from "@/lib/constants/counties";
import { createAdminProject, type NewProjectState } from "./actions";

const initialState: NewProjectState = { error: null };

// ── Public types (used by page.tsx) ───────────────────────────────────────────

export type CompanyMember = {
  userId: string;
  displayName: string | null;
  email: string | null;
  label: string;
};

export type CompanyMembersMap = Record<
  string,
  { projectManagers: CompanyMember[] }
>;

// ── Field primitives ──────────────────────────────────────────────────────────

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  defaultValue,
  uppercase,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  // Visual-only uppercase. The submitted form value is unchanged; the server
  // action normalizes on save.
  uppercase?: boolean;
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
        className={`w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20${uppercase ? " uppercase-input" : ""}`}
        style={{ border: "1px solid #d4dde4" }}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: readonly string[];
  required?: boolean;
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
    </div>
  );
}

// County select is driven by the selected state. Keyed on selectedState so it
// resets automatically whenever the state changes.
function CountySelect({ selectedState }: { selectedState: string }) {
  const counties = selectedState ? (STATE_COUNTIES[selectedState] ?? []) : [];
  const hasCounties = counties.length > 0;

  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="county">
        County
      </label>
      <select
        key={selectedState}
        id="county"
        name="county"
        disabled={!hasCounties}
        className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                   outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer
                   disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ border: "1px solid #d4dde4" }}
      >
        <option value="">
          {selectedState && !hasCounties ? "No county data for this state" : "Select county…"}
        </option>
        {counties.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

// Member dropdown (Project Manager / Client Admin). Disabled until a company
// is selected. When enabled, shows users from that company filtered by role.
function MemberSelect({
  label,
  name,
  members,
  hasCompany,
  emptyLabel,
}: {
  label: string;
  name: string;
  members: CompanyMember[];
  hasCompany: boolean;
  emptyLabel: string;
}) {
  // The select is keyed on the active company's member-list signature so it
  // resets to the placeholder option when the company changes.
  const resetKey = useMemo(
    () => members.map((m) => m.userId).join("|"),
    [members]
  );
  const placeholder = !hasCompany
    ? "Select a company first"
    : members.length === 0
      ? emptyLabel
      : "Select…";

  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5" htmlFor={name}>
        {label}
      </label>
      <select
        key={resetKey}
        id={name}
        name={name}
        disabled={!hasCompany || members.length === 0}
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

export function NewProjectForm({
  companies,
  companyMembers,
}: {
  companies: Company[];
  companyMembers: CompanyMembersMap;
}) {
  const [state, formAction] = useActionState(createAdminProject, initialState);
  const [selectedState, setSelectedState] = useState("NJ");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const activeMembers = selectedCompanyId
    ? companyMembers[selectedCompanyId] ?? { projectManagers: [], clientAdmins: [] }
    : { projectManagers: [], clientAdmins: [] };
  const hasCompany = !!selectedCompanyId;

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
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
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
          <MemberSelect
            label="Project Manager"
            name="project_manager_id"
            members={activeMembers.projectManagers}
            hasCompany={hasCompany}
            emptyLabel="No project managers in this company"
          />
          <Field label="Client Job Number" name="job_number_client" placeholder="e.g. JB-2026-04812" />
        </div>
      </fieldset>

      {/* ── Project Details ───────────────────────────────────── */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Project Details
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Requested Approval Date" name="requested_approval_date" type="date" />
          <SelectField
            label="Plan Type"
            name="type_of_plan"
            options={PLAN_TYPE_OPTIONS}
            required
          />
        </div>
      </fieldset>

      {/* ── Location ──────────────────────────────────────────── */}
      {/*
        Phase A — structured address replaces the free-form
        "Job Name / Address" field. The legacy job_name and job_address
        columns are still populated server-side (derived from
        street_address + job_number_client) for backwards compatibility
        with PDF mappings and existing displays.
      */}
      <fieldset style={{ borderTop: "1px solid #e3e9ec" }} className="pt-8">
        <legend className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Location
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Street Address" name="street_address" placeholder="e.g. 123 Main St" required uppercase />
          </div>
          <Field label="City / Municipality" name="city" placeholder="e.g. Lodi" required uppercase />
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="state">
              State
            </label>
            <select
              id="state"
              name="state"
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
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
          <Field label="ZIP Code" name="zip_code" placeholder="e.g. 07644" uppercase />
          <CountySelect selectedState={selectedState} />
          <SelectField label="Authority Type" name="authority_type" options={AUTHORITY_TYPE_OPTIONS} required />
          <Field label="Milepost Start" name="milepost_start" placeholder="e.g. MP 14.3 N" uppercase />
          <Field label="Milepost End"   name="milepost_end"   placeholder="e.g. MP 14.7 N" uppercase />
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
          placeholder="Work scope, special considerations, etc."
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
