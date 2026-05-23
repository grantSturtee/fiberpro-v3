"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteIntakeFile,
  type CompanyFileActionState,
} from "@/app/(company)/company/projects/[id]/actions";

const initialState: CompanyFileActionState = { error: null };

function DeleteBtn({ fileName }: { fileName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Delete file"
      onClick={(e) => {
        if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) e.preventDefault();
      }}
      className={
        pending
          ? "text-faint cursor-default disabled:opacity-40"
          : "text-muted hover:text-danger transition-colors"
      }
    >
      {pending ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}

export function DeleteIntakeFileButton({
  fileId,
  projectId,
  fileName,
}: {
  fileId: string;
  projectId: string;
  fileName: string;
}) {
  const [, formAction] = useActionState(deleteIntakeFile, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="file_id" value={fileId} />
      <input type="hidden" name="project_id" value={projectId} />
      <DeleteBtn fileName={fileName} />
    </form>
  );
}
