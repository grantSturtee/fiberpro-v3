"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { markSetupComplete, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-50"
      style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}
    >
      {pending ? "Checking…" : "Mark Setup Complete"}
    </button>
  );
}

export function MarkSetupCompleteButton({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(
    markSetupComplete,
    { error: null }
  );

  return (
    <form action={formAction} className="flex items-center gap-3 flex-wrap">
      <input type="hidden" name="project_id" value={projectId} />
      <SubmitBtn />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
