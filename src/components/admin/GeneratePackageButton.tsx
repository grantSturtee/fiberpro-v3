"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  enqueuePackageGeneration,
  type EnqueuePackageState,
} from "@/app/(admin)/admin/projects/[id]/actions";

const initialState: EnqueuePackageState = { error: null };

function EnqueueBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Queueing…" : "Generate Package"}
    </button>
  );
}

export function GeneratePackageButton({
  projectId,
  canGenerate,
  disabledReason,
}: {
  projectId: string;
  canGenerate: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState(enqueuePackageGeneration, initialState);

  if (state.jobId) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-700">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
        Job queued — waiting for n8n pickup.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <form action={formAction}>
        <input type="hidden" name="project_id" value={projectId} />
        <EnqueueBtn disabled={!canGenerate} />
      </form>
      {!canGenerate && disabledReason && (
        <p className="text-xs text-muted">{disabledReason}</p>
      )}
      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </div>
  );
}
