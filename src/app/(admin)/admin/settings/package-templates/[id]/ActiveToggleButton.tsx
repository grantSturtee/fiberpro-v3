"use client";

import { useActionState } from "react";
import { setBlueprintStatus, type BlueprintActionState } from "../actions";

const initial: BlueprintActionState = { error: null };

type Status = "draft" | "active" | "inactive";

// Only rendered for draft blueprints — active/inactive is handled inside SlotsForm.
export function ActiveToggleButton({
  blueprintId,
  currentStatus,
  missingRequired,
}: {
  blueprintId: string;
  currentStatus: Status;
  missingRequired: string[];
}) {
  const [state, formAction, pending] = useActionState(setBlueprintStatus, initial);

  if (currentStatus !== "draft") return null;

  if (missingRequired.length > 0) {
    return (
      <button
        type="button"
        disabled
        title="Configure all required sections to activate"
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-rule text-faint bg-surface cursor-not-allowed opacity-50"
      >
        Activate
      </button>
    );
  }

  return (
    <div>
      {state.error && <p className="text-xs text-red-600 mb-1">{state.error}</p>}
      <form action={formAction}>
        <input type="hidden" name="blueprint_id" value={blueprintId} />
        <input type="hidden" name="new_status" value="active" />
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          {pending ? "Activating…" : "Activate"}
        </button>
      </form>
    </div>
  );
}
