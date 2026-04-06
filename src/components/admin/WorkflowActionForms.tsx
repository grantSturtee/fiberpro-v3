"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestRevisions,
  approveDesign,
  type AdminActionState,
} from "@/app/(admin)/admin/projects/[id]/actions";

// ── Approve Design ────────────────────────────────────────────────────────────

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-colors"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Approving…" : "Approve Design"}
    </button>
  );
}

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

// ── Request Revisions ─────────────────────────────────────────────────────────

function RevisionSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink disabled:opacity-60 transition-colors"
    >
      {pending ? "Sending…" : "Request Revisions"}
    </button>
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
        rows={2}
        placeholder="Describe what needs to be revised (optional)…"
        className="w-full text-xs text-ink bg-canvas rounded-lg px-3 py-2 resize-none outline-none"
        style={{ border: "1px solid #d4dde4" }}
      />
      <RevisionSubmitButton />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
