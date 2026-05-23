"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setProjectPeRequired } from "@/app/(admin)/admin/projects/[id]/actions";

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-primary hover:underline disabled:opacity-40"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function PeRequiredToggle({
  projectId,
  peRequired,
}: {
  projectId: string;
  peRequired: boolean | null;
}) {
  const [state, formAction] = useActionState(setProjectPeRequired, { error: null });

  return (
    <form action={formAction} className="flex items-center gap-3 flex-wrap">
      <input type="hidden" name="project_id" value={projectId} />
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          name="pe_required"
          defaultChecked={peRequired === true}
          className="w-4 h-4 rounded border-surface accent-primary"
        />
        <span className="text-sm text-ink">PE Stamp Required</span>
      </label>
      <SaveBtn />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="text-xs text-emerald-600">Saved</p>}
    </form>
  );
}
