"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setProjectBlueprint, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlueprintOption = {
  id: string;
  description: string;
  work_type: string | null;
  status?: string | null;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SaveBtn({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="text-xs px-3 py-1.5 rounded-lg font-medium text-white bg-[#1565C0] hover:bg-[#1251A3] transition-colors disabled:opacity-40"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BlueprintSelector({
  projectId,
  currentBlueprintId,
  authorityActiveBlueprintId,
  blueprints,
  hasAuthority,
}: {
  projectId: string;
  currentBlueprintId: string | null;
  authorityActiveBlueprintId: string | null;
  blueprints: BlueprintOption[];
  hasAuthority: boolean;
}) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(
    setProjectBlueprint,
    { error: null }
  );

  const authorityDefault = blueprints.find((b) => b.id === authorityActiveBlueprintId);
  const noActiveTemplate = hasAuthority && blueprints.length === 0;
  const overrideMissing =
    !!currentBlueprintId && !blueprints.some((b) => b.id === currentBlueprintId);
  const defaultLabel = authorityDefault
    ? `Use authority default — ${authorityDefault.description}`
    : noActiveTemplate
      ? "No active package template configured"
      : "No authority default configured";

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="project_id" value={projectId} />

      <select
        name="blueprint_id"
        defaultValue={currentBlueprintId ?? ""}
        disabled={!hasAuthority || noActiveTemplate}
        className="w-full border border-[#D1D5DB] rounded-md px-3 py-2 text-[14px] bg-white text-[#111827] focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#EFF6FF] disabled:opacity-50"
      >
        <option value="">{defaultLabel}</option>
        {blueprints.map((b) => (
          <option key={b.id} value={b.id}>
            {b.description}{b.work_type ? ` (${b.work_type})` : ""}
            {b.id === authorityActiveBlueprintId ? " ★" : ""}
          </option>
        ))}
      </select>

      <p className="text-[11px] text-[#9CA3AF]">
        Only active templates for the selected authority are listed.
      </p>

      <div className="flex items-center gap-3">
        <SaveBtn disabled={!hasAuthority || noActiveTemplate} />
        {!hasAuthority ? (
          <span className="text-xs text-[#6B7280]">Select a permitting authority first.</span>
        ) : noActiveTemplate ? (
          <span className="text-xs text-[#D97706] font-medium">No active package template configured</span>
        ) : overrideMissing ? (
          <span className="text-xs text-[#D97706] font-medium">
            Saved override is no longer active — generation will use authority default
          </span>
        ) : currentBlueprintId ? (
          <span className="text-xs text-[#D97706] font-medium">Template override selected</span>
        ) : (
          <span className="text-xs text-[#6B7280]">Using authority default</span>
        )}
        {state.error && <p className="text-xs text-[#DC2626]">{state.error}</p>}
        {state.success && <p className="text-xs text-[#16A34A]">Saved</p>}
      </div>
    </form>
  );
}
