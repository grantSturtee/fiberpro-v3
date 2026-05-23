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
      className="w-full h-full px-4 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-colors"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
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
      className="w-full h-full px-4 py-2.5 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink disabled:opacity-60 transition-colors"
      style={{ border: "1px solid #d4dde4" }}
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
          className="flex-1 w-full text-xs text-ink bg-canvas rounded-lg px-3 py-2 resize-none outline-none"
          style={{ border: "1px solid #d4dde4", minHeight: "90px" }}
        />
        {revisionsState.error && (
          <p className="text-xs text-red-600">{revisionsState.error}</p>
        )}
        {approveState.error && (
          <p className="text-xs text-red-600">{approveState.error}</p>
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
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
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
        className="w-full text-xs text-ink bg-canvas rounded-lg px-3 py-2 resize-none outline-none"
        style={{ border: "1px solid #d4dde4" }}
      />
      <RevisionSubmitButton />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
