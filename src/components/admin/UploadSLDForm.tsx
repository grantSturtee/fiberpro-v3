"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { uploadSLD, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

function SubmitButton({ hasFile }: { hasFile: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !hasFile}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white flex-shrink-0 disabled:opacity-50 transition-colors"
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
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="project_id" value={projectId} />

      <label
        className="flex items-center gap-3 w-full px-3.5 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5"
        style={{ borderColor: fileName ? "#005bc1" : "#d4dde4", background: fileName ? "rgba(0,91,193,0.04)" : undefined }}
      >
        <div className="flex-1 min-w-0">
          {fileName ? (
            <p className="text-sm text-ink truncate font-medium">{fileName}</p>
          ) : (
            <p className="text-sm text-muted">Choose PDF or drag & drop here</p>
          )}
          <p className="text-xs text-faint mt-0.5">PDF only · max 50 MB</p>
        </div>
        <span className="text-xs font-medium text-primary flex-shrink-0">
          {fileName ? "Change" : "Browse"}
        </span>
        <input
          type="file"
          name="file"
          accept=".pdf,application/pdf"
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <div>
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          {state.success && <p className="text-xs text-emerald-600">SLD sheet uploaded.</p>}
        </div>
        <SubmitButton hasFile={!!fileName} />
      </div>
    </form>
  );
}
