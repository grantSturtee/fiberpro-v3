"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setAllRequirementOverrides,
  type AdminActionState,
} from "@/app/(admin)/admin/projects/[id]/actions";
import type { AuthorityRequirementDefaults, ProjectRequirementOverrides } from "@/lib/utils/resolveRequirements";

// ── Props ─────────────────────────────────────────────────────────────────────

export type RequirementOverridesProps = {
  projectId: string;
  authority: AuthorityRequirementDefaults | null;
  overrides: ProjectRequirementOverrides;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function encodeOverride(v: boolean | null): "inherit" | "on" | "off" {
  if (v === true) return "on";
  if (v === false) return "off";
  return "inherit";
}

function OverrideSelect({
  name,
  value,
  authorityDefault,
}: {
  name: string;
  value: boolean | null;
  authorityDefault: boolean | undefined;
}) {
  const defaultStr = authorityDefault === true ? "Yes" : authorityDefault === false ? "No" : "—";
  return (
    <select
      name={name}
      defaultValue={encodeOverride(value)}
      className="w-full text-xs text-[#111827] bg-white border border-[#D1D5DB] rounded-md px-2.5 py-1.5 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#EFF6FF]"
    >
      <option value="inherit">Authority default ({defaultStr})</option>
      <option value="on">Required</option>
      <option value="off">Not required</option>
    </select>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs px-3 py-1.5 rounded-lg font-medium text-white bg-[#1565C0] hover:bg-[#1251A3] transition-colors disabled:opacity-40"
    >
      {pending ? "Saving…" : "Save overrides"}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RequirementOverridesForm({
  projectId,
  authority,
  overrides,
}: RequirementOverridesProps) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(
    setAllRequirementOverrides,
    { error: null }
  );

  const rows: { label: string; name: string; value: boolean | null; defaultVal: boolean | undefined }[] = [
    { label: "Application Form",    name: "req_application_override",       value: overrides.req_application_override,       defaultVal: authority?.requires_application },
    { label: "Certification Form",  name: "req_certification_override",     value: overrides.req_certification_override,     defaultVal: authority?.requires_certification },
    { label: "COI",                 name: "req_coi_override",               value: overrides.req_coi_override,               defaultVal: authority?.requires_coi },
    { label: "PE Stamp",            name: "pe_required",                    value: overrides.pe_required,                    defaultVal: authority?.requires_pe },
    { label: "Hard Copies",         name: "req_hard_copies_override",       value: overrides.req_hard_copies_override,       defaultVal: authority?.requires_hard_copies },
    { label: "Certified Check",     name: "req_certified_check_override",   value: overrides.req_certified_check_override,   defaultVal: authority?.requires_certified_check },
    { label: "Notification Only",   name: "req_notification_only_override", value: overrides.req_notification_only_override, defaultVal: authority?.notification_only },
  ];

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />

      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.name}>
            <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-1">
              {row.label}
            </p>
            <OverrideSelect
              name={row.name}
              value={row.value}
              authorityDefault={row.defaultVal}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SaveBtn />
        {state.error && <p className="text-xs text-[#DC2626]">{state.error}</p>}
        {state.success && <p className="text-xs text-[#16A34A]">Saved</p>}
      </div>
    </form>
  );
}
