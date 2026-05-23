"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  deactivateCoverTemplate,
  activateCoverTemplate,
  type SettingsActionState,
} from "@/app/(admin)/admin/settings/actions";

const initialState: SettingsActionState = { error: null };

// ── Deactivate ────────────────────────────────────────────────────────────────

function DeactivateBtn({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={`Deactivate "${name}"`}
      aria-label={`Deactivate ${name}`}
      onClick={(e) => {
        if (!confirm(`Deactivate "${name}"?`)) e.preventDefault();
      }}
      className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-red-50 disabled:opacity-40 transition-colors"
    >
      {pending ? <SpinIcon /> : <ArchiveIcon />}
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

// ── Activate ──────────────────────────────────────────────────────────────────

function ActivateBtn({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={`Restore "${name}"`}
      aria-label={`Restore ${name}`}
      className="p-1 rounded text-dim hover:text-green-700 hover:bg-green-50 disabled:opacity-40 transition-colors"
    >
      {pending ? <SpinIcon /> : <RestoreIcon />}
    </button>
  );
}

export function CoverActivateButton({ itemId, name }: { itemId: string; name: string }) {
  const [, formAction] = useActionState(activateCoverTemplate, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={itemId} />
      <ActivateBtn name={name} />
    </form>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="2" width="13" height="3.5" rx="1" />
      <path d="M2.5 5.5v7a1 1 0 001 1h9a1 1 0 001-1v-7" />
      <path d="M6 9h4" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8a5 5 0 105 -5" />
      <path d="M3 4v4h4" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="animate-spin">
      <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
      <path d="M8 2a6 6 0 016 6" />
    </svg>
  );
}
