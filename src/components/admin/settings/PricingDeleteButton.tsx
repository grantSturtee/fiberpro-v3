"use client";

import { useFormStatus } from "react-dom";
import { deletePricingRule } from "@/app/(admin)/admin/settings/pricing/actions";

function DeleteBtn({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Delete rule"
      aria-label={`Delete rule "${name}"`}
      onClick={(e) => {
        if (!confirm("Delete this pricing rule? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
      className="text-red-600 hover:text-red-700 transition-colors p-1 disabled:opacity-40"
    >
      {pending ? (
        // Tiny spinner so the icon position doesn't shift while the action runs.
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="animate-spin"
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <path
            d="M14 8a6 6 0 00-6-6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M2 4h12M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5 4l.7 9.1a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L11 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export function PricingDeleteButton({ itemId, name }: { itemId: string; name: string }) {
  return (
    <form action={deletePricingRule}>
      <input type="hidden" name="id" value={itemId} />
      <DeleteBtn name={name} />
    </form>
  );
}
