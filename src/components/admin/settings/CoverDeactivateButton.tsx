"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deactivateCoverTemplate, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

function DeactivateBtn({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Deactivate "${name}"?`)) e.preventDefault();
      }}
      className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-40"
    >
      {pending ? "…" : "Deactivate"}
    </button>
  );
}

export function CoverDeactivateButton({ itemId, name }: { itemId: string; name: string }) {
  const [, formAction] = useActionState(deactivateCoverTemplate, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={itemId} />
      <DeactivateBtn name={name} />
    </form>
  );
}
