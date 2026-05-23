"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removeCompanyMember, type CompanyActionState } from "@/app/(admin)/admin/companies/[id]/actions";

const initialState: CompanyActionState = { error: null };

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 14,4" />
      <path d="M5,4V2h6v2" />
      <path d="M3,4l1,10h8l1-10" />
    </svg>
  );
}

function RemoveBtn({ displayName, asIcon }: { displayName: string; asIcon?: boolean }) {
  const { pending } = useFormStatus();
  if (asIcon) {
    return (
      <button
        type="submit"
        disabled={pending}
        title={`Remove ${displayName} from this company`}
        onClick={(e) => {
          if (!confirm(`Remove ${displayName} from this company?`)) e.preventDefault();
        }}
        className="p-1 rounded text-faint hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
      >
        {pending ? <span className="text-[11px]">…</span> : <TrashIcon />}
      </button>
    );
  }
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Remove ${displayName} from this company?`)) e.preventDefault();
      }}
      className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-40"
    >
      {pending ? "…" : "Remove from Company"}
    </button>
  );
}

export function RemoveCompanyMemberButton({
  membershipId,
  companyId,
  displayName,
  asIcon,
}: {
  membershipId: string;
  companyId: string;
  displayName: string;
  asIcon?: boolean;
}) {
  const [, formAction] = useActionState(removeCompanyMember, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="membership_id" value={membershipId} />
      <input type="hidden" name="company_id" value={companyId} />
      <RemoveBtn displayName={displayName} asIcon={asIcon} />
    </form>
  );
}
