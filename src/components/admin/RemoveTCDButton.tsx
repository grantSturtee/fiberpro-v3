"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removeTCDFromProject, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-500 hover:underline disabled:opacity-50 flex-shrink-0"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function RemoveTCDButton({
  selectionId,
  projectId,
}: {
  selectionId: string;
  projectId: string;
}) {
  const [, action] = useActionState<AdminActionState, FormData>(removeTCDFromProject, {
    error: null,
  });

  return (
    <form action={action}>
      <input type="hidden" name="selection_id" value={selectionId} />
      <input type="hidden" name="project_id" value={projectId} />
      <SubmitButton />
    </form>
  );
}
