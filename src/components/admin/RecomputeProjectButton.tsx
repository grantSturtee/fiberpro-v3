"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  recomputeProject,
  type RecomputeProjectState,
} from "@/app/(admin)/admin/projects/[id]/actions";

const initialState: RecomputeProjectState = { error: null };

function ComputeBtn({ highlighted }: { highlighted: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
        highlighted
          ? "text-white"
          : "bg-surface text-dim hover:text-ink"
      }`}
      style={
        highlighted
          ? { background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }
          : { border: "1px solid #d4dde4" }
      }
    >
      {pending ? (
        <>
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Computing…
        </>
      ) : (
        "Recalculate Project"
      )}
    </button>
  );
}

export function RecomputeProjectButton({
  projectId,
  highlighted = false,
}: {
  projectId: string;
  highlighted?: boolean;
}) {
  const [state, formAction] = useActionState(recomputeProject, initialState);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="project_id" value={projectId} />
        <ComputeBtn highlighted={highlighted} />
      </form>

      {state.error && (
        <p className="text-[11px] text-red-600">{state.error}</p>
      )}

      {state.error === null && state.estimatedPrice !== undefined && (
        <p className="text-[11px] text-emerald-700">
          Updated — {state.jurisdictionMatched ? "jurisdiction matched" : "no jurisdiction match"},{" "}
          {state.estimatedPrice !== null
            ? `estimated $${state.estimatedPrice.toFixed(2)}`
            : "no pricing rule matched"}
          {state.ruleName ? ` (${state.ruleName})` : ""}
        </p>
      )}
    </div>
  );
}
