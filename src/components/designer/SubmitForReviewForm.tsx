"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitForReview, type DesignerActionState } from "@/app/(designer)/designer/projects/[id]/actions";

function SubmitButton({ disabled, label }: { disabled?: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Submitting…" : label}
    </button>
  );
}

export function SubmitForReviewForm({
  projectId,
  hasTCPFiles,
  isRevision = false,
}: {
  projectId: string;
  hasTCPFiles: boolean;
  isRevision?: boolean;
}) {
  const [state, formAction] = useActionState<DesignerActionState, FormData>(submitForReview, {
    error: null,
  });

  const title = isRevision ? "Ready to resubmit?" : "Ready for admin review?";
  const hint = isRevision
    ? hasTCPFiles
      ? "Upload revised TCP sheets above, then resubmit for admin review."
      : "Upload at least one TCP sheet before resubmitting."
    : hasTCPFiles
      ? "All TCP sheets uploaded. Submit when ready."
      : "Upload at least one TCP sheet before submitting.";
  const buttonLabel = isRevision ? "Resubmit for Approval" : "Submit for Review";

  return (
    <div
      className="flex items-center justify-between gap-4 bg-card rounded-xl px-6 py-5"
      style={{ boxShadow: "0 1px 12px rgba(43,52,55,0.06)" }}
    >
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted mt-0.5">{hint}</p>
        {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
      </div>
      <form action={formAction}>
        <input type="hidden" name="project_id" value={projectId} />
        <SubmitButton disabled={!hasTCPFiles} label={buttonLabel} />
      </form>
    </div>
  );
}
