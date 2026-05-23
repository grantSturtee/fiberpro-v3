"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { deleteTCDEntry, type SettingsActionState } from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

function DeleteBtn({ code }: { code: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Delete ${code}? This cannot be undone.`)) e.preventDefault();
      }}
      className="p-1.5 rounded text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
      title={`Delete ${code}`}
      aria-label={`Delete ${code}`}
    >
      {pending ? (
        <span className="block w-3.5 h-3.5 text-[10px] text-center leading-[14px]">…</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

export function TcdDeleteButton({ itemId, code }: { itemId: string; code: string }) {
  const [state, formAction] = useActionState(deleteTCDEntry, initialState);

  useEffect(() => {
    if (state.error) alert(state.error);
  }, [state.error]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={itemId} />
      <DeleteBtn code={code} />
    </form>
  );
}
