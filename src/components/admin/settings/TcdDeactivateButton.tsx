"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deactivateTCDEntry, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

function DeactivateBtn({ code }: { code: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Deactivate ${code}? It will be hidden from production.`)) {
          e.preventDefault();
        }
      }}
      className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-40"
    >
      {pending ? "…" : "Deactivate"}
    </button>
  );
}

export function TcdDeactivateButton({ itemId, code }: { itemId: string; code: string }) {
  const [, formAction] = useActionState(deactivateTCDEntry, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={itemId} />
      <DeactivateBtn code={code} />
    </form>
  );
}
