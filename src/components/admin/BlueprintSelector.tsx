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
      className="text-xs px-3 py-1.5 rounded-lg font-medium text-white transition-opacity disabled:opacity-40"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
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
        className="w-full text-sm text-ink bg-canvas rounded-lg px-3 py-1.5 outline-none disabled:opacity-50"
        style={{ border: "1px solid #d4dde4" }}
      >
        <option value="">{defaultLabel}</option>
        {blueprints.map((b) => (
          <option key={b.id} value={b.id}>
            {b.description}{b.work_type ? ` (${b.work_type})` : ""}
            {b.id === authorityActiveBlueprintId ? " ★" : ""}
          </option>
        ))}
      </select>

      <p className="text-[11px] text-faint">
        Only active templates for the selected authority are listed.
      </p>

      <div className="flex items-center gap-3">
        <SaveBtn disabled={!hasAuthority || noActiveTemplate} />
        {!hasAuthority ? (
          <span className="text-xs text-muted">Select a permitting authority first.</span>
        ) : noActiveTemplate ? (
          <span className="text-xs text-amber-700 font-medium">No active package template configured</span>
        ) : overrideMissing ? (
          <span className="text-xs text-amber-700 font-medium">
            Saved override is no longer active — generation will use authority default
          </span>
        ) : currentBlueprintId ? (
          <span className="text-xs text-amber-700 font-medium">Template override selected</span>
        ) : (
          <span className="text-xs text-muted">Using authority default</span>
        )}
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state.success && <p className="text-xs text-emerald-600">Saved</p>}
      </div>
    </form>
  );
}
