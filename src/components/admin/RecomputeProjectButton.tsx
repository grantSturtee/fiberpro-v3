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
          ? "bg-[#1565C0] hover:bg-[#1251A3] text-white"
          : "bg-[#F8F9FB] text-[#6B7280] hover:text-[#111827] border border-[#E5E7EB]"
      }`}
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
        <p className="text-[11px] text-[#DC2626]">{state.error}</p>
      )}

      {state.error === null && state.estimatedPrice !== undefined && (
        <p className="text-[11px] text-[#16A34A]">
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
