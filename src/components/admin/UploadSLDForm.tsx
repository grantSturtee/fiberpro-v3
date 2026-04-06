"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { uploadSLD, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white flex-shrink-0 disabled:opacity-60 transition-colors"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

export function UploadSLDForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(uploadSLD, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="project_id" value={projectId} />
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="file"
          name="file"
          accept=".pdf,application/pdf"
          required
          className="text-xs text-ink flex-1 min-w-0"
        />
        <SubmitButton />
      </div>
      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-emerald-600">SLD sheet uploaded successfully.</p>
      )}
    </form>
  );
}
