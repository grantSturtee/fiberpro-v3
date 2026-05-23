"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setProjectAuthority } from "@/app/(admin)/admin/projects/[id]/actions";

export type AuthorityProfileOption = {
  id: string;
  name: string;
  type: string;
};

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-primary hover:underline disabled:opacity-40"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function AuthoritySelector({
  projectId,
  currentAuthorityId,
  authorities,
}: {
  projectId: string;
  currentAuthorityId: string | null;
  authorities: AuthorityProfileOption[];
}) {
  const [state, formAction] = useActionState(setProjectAuthority, { error: null });

  return (
    <form action={formAction} className="flex items-center gap-3 flex-wrap">
      <input type="hidden" name="project_id" value={projectId} />
      <select
        name="authority_id"
        defaultValue={currentAuthorityId ?? ""}
        className="text-sm text-ink bg-canvas rounded-lg px-3 py-1.5 outline-none"
        style={{ border: "1px solid #d4dde4" }}
      >
        <option value="">— No authority selected —</option>
        {authorities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <SaveBtn />
      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-green-600">Saved</p>
      )}
    </form>
  );
}
