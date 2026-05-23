"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TemplateActionState } from "@/app/(admin)/admin/settings/authorities/[id]/templates/actions";

function DeleteBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Delete template"
      className="p-2 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
    >
      {pending ? (
        <span className="text-xs">…</span>
      ) : (
        <TrashIcon />
      )}
      <span className="sr-only">Delete template</span>
    </button>
  );
}

export function DeleteAuthorityTemplateButton({
  templateId,
  authorityId,
  action,
}: {
  templateId: string;
  authorityId: string;
  action: (state: TemplateActionState, formData: FormData) => Promise<TemplateActionState>;
}) {
  const [state, formAction] = useActionState(action, { error: null });

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Delete this template? The PDF will also be removed from storage.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="authority_id" value={authorityId} />
      <DeleteBtn />
      {state.error && (
        <p className="text-xs text-red-600 mt-1">{state.error}</p>
      )}
    </form>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3.5h10" />
      <path d="M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1" />
      <path d="M10.5 3.5l-.5 8h-6l-.5-8" />
    </svg>
  );
}
