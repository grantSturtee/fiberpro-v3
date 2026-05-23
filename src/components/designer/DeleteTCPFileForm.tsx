"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteTCPFile, type DesignerActionState } from "@/app/(designer)/designer/projects/[id]/actions";

function DeleteButton({ fileName }: { fileName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Remove TCP sheet"
      aria-label={`Remove ${fileName}`}
      onClick={(e) => {
        if (!confirm("Remove this TCP sheet?")) e.preventDefault();
      }}
      className="p-1.5 rounded text-muted hover:text-red-600 disabled:opacity-50 transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3 4l.8 9.5a.5.5 0 0 0 .5.5h7.4a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function DeleteTCPFileForm({
  fileId,
  projectId,
  fileName,
}: {
  fileId: string;
  projectId: string;
  fileName: string;
}) {
  const [, formAction] = useActionState<DesignerActionState, FormData>(deleteTCPFile, {
    error: null,
  });

  return (
    <form action={formAction}>
      <input type="hidden" name="file_id" value={fileId} />
      <input type="hidden" name="project_id" value={projectId} />
      <DeleteButton fileName={fileName} />
    </form>
  );
}
