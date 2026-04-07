"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removeCompanyMember, type CompanyActionState } from "@/app/(admin)/admin/companies/[id]/actions";

const initialState: CompanyActionState = { error: null };

function RemoveBtn({ displayName }: { displayName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Remove ${displayName} from this company?`)) e.preventDefault();
      }}
      className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-40"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}

export function RemoveCompanyMemberButton({
  membershipId,
  companyId,
  displayName,
}: {
  membershipId: string;
  companyId: string;
  displayName: string;
}) {
  const [, formAction] = useActionState(removeCompanyMember, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="membership_id" value={membershipId} />
      <input type="hidden" name="company_id" value={companyId} />
      <RemoveBtn displayName={displayName} />
    </form>
  );
}
