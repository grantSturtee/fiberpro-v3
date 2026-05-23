"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  archiveCompany,
  unarchiveCompany,
  type CompanyActionState,
} from "@/app/(admin)/admin/companies/[id]/actions";

const initialState: CompanyActionState = { error: null };

// ── Archive button with inline confirmation ───────────────────────────────────

function ConfirmArchiveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
      style={{ background: "linear-gradient(135deg, #c0392b 0%, #a93226 100%)" }}
    >
      {pending ? "Archiving…" : "Archive"}
    </button>
  );
}

export function ArchiveCompanyButton({ companyId }: { companyId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(archiveCompany, initialState);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 border border-red-300 rounded-lg px-3 py-2 bg-white">
        <span className="text-sm font-medium text-red-600 mr-1">Confirm archive?</span>
        <form action={formAction}>
          <input type="hidden" name="company_id" value={companyId} />
          <ConfirmArchiveBtn />
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
        {state.error && (
          <p className="text-xs text-red-600 ml-1">{state.error}</p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-red-300 text-red-600 hover:bg-red-50"
    >
      Archive Company
    </button>
  );
}

// ── Unarchive button (no confirmation required) ───────────────────────────────

function UnarchiveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Restoring…" : "Unarchive Company"}
    </button>
  );
}

export function UnarchiveCompanyButton({ companyId }: { companyId: string }) {
  const [state, formAction] = useActionState(unarchiveCompany, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="company_id" value={companyId} />
      <UnarchiveBtn />
      {state.error && (
        <p className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
