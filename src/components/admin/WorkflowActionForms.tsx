"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestRevisions,
  approveDesign,
  type AdminActionState,
} from "@/app/(admin)/admin/projects/[id]/actions";

// ── Button components ─────────────────────────────────────────────────────────

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full h-full px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] disabled:opacity-60 transition-colors"
    >
      {pending ? "Approving…" : "Approve Design"}
    </button>
  );
}

function RevisionSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full h-full px-4 py-2.5 rounded-lg text-xs font-medium bg-white text-[#374151] hover:bg-[#F9FAFB] hover:text-[#111827] border border-[#E5E7EB] disabled:opacity-60 transition-colors"
    >
      {pending ? "Sending…" : "Request Revisions"}
    </button>
  );
}

// ── Combined review panel ─────────────────────────────────────────────────────
// Left: revision textarea spanning full height (associated with the revisions
// form via the HTML5 `form` attribute). Right: two stacked action buttons.

export function DesignReviewPanel({ projectId }: { projectId: string }) {
  const revisionsFormId = `revisions-form-${projectId}`;

  const [approveState, approveAction] = useActionState<AdminActionState, FormData>(approveDesign, {
    error: null,
  });
  const [revisionsState, revisionsAction] = useActionState<AdminActionState, FormData>(requestRevisions, {
    error: null,
  });

  return (
    <div className="flex items-stretch gap-4">
      {/* Left: revision textarea — linked to the revisions form via form attribute */}
      <div className="flex-1 flex flex-col gap-1.5">
        <textarea
          name="revision_notes"
          required
          form={revisionsFormId}
          placeholder="Describe what needs to be revised…"
          className="flex-1 w-full text-xs text-[#111827] bg-white border border-[#D1D5DB] rounded-md px-3 py-2 resize-none focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#EFF6FF] placeholder:text-[#9CA3AF]"
          style={{ minHeight: "90px" }}
        />
        {revisionsState.error && (
          <p className="text-xs text-[#DC2626]">{revisionsState.error}</p>
        )}
        {approveState.error && (
          <p className="text-xs text-[#DC2626]">{approveState.error}</p>
        )}
      </div>

      {/* Right: stacked action buttons */}
      <div className="flex flex-col gap-2 w-40 flex-shrink-0">
        {/* Approve form */}
        <form action={approveAction} className="flex-1 flex flex-col">
          <input type="hidden" name="project_id" value={projectId} />
          <ApproveButton />
        </form>

        {/* Revisions form — textarea data attached via id/form association */}
        <form id={revisionsFormId} action={revisionsAction} className="flex-1 flex flex-col">
          <input type="hidden" name="project_id" value={projectId} />
          <RevisionSubmitButton />
        </form>
      </div>
    </div>
  );
}

// ── Legacy standalone exports ─────────────────────────────────────────────────

export function ApproveDesignForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(approveDesign, {
    error: null,
  });
  return (
    <form action={formAction}>
      <input type="hidden" name="project_id" value={projectId} />
      <ApproveButton />
      {state.error && <p className="mt-1 text-xs text-[#DC2626]">{state.error}</p>}
    </form>
  );
}

export function RequestRevisionsForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(requestRevisions, {
    error: null,
  });
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <textarea
        name="revision_notes"
        required
        rows={2}
        placeholder="Describe what needs to be revised…"
        className="w-full text-xs text-[#111827] bg-white border border-[#D1D5DB] rounded-md px-3 py-2 resize-none focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#EFF6FF] placeholder:text-[#9CA3AF]"
      />
      <RevisionSubmitButton />
      {state.error && <p className="text-xs text-[#DC2626]">{state.error}</p>}
    </form>
  );
}
