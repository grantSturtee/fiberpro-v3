"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deactivatePricingRule, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

function DeactivateBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Deactivate "${label}"?`)) e.preventDefault();
      }}
      className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-40"
    >
      {pending ? "…" : "Deactivate"}
    </button>
  );
}

export function PricingDeactivateButton({ itemId, label }: { itemId: string; label: string }) {
  const [, formAction] = useActionState(deactivatePricingRule, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={itemId} />
      <DeactivateBtn label={label} />
    </form>
  );
}
