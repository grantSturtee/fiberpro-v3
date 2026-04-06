"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteTCPFile, type DesignerActionState } from "@/app/(designer)/designer/projects/[id]/actions";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-500 hover:underline disabled:opacity-50"
      onClick={(e) => {
        if (!confirm("Remove this TCP sheet?")) e.preventDefault();
      }}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function DeleteTCPFileForm({
  fileId,
  projectId,
}: {
  fileId: string;
  projectId: string;
}) {
  const [, formAction] = useActionState<DesignerActionState, FormData>(deleteTCPFile, {
    error: null,
  });

  return (
    <form action={formAction}>
      <input type="hidden" name="file_id" value={fileId} />
      <input type="hidden" name="project_id" value={projectId} />
      <DeleteButton />
    </form>
  );
}
