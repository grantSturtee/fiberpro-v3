"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignDesigner, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

type Designer = { id: string; display_name: string; email: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1565C0] hover:bg-[#1251A3] flex-shrink-0 disabled:opacity-60 transition-colors"
    >
      {pending ? "Assigning…" : "Assign"}
    </button>
  );
}

export function AssignDesignerForm({
  projectId,
  designers,
  currentDesignerId,
}: {
  projectId: string;
  designers: Designer[];
  currentDesignerId: string | null;
}) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(assignDesigner, {
    error: null,
  });

  if (designers.length === 0) {
    return (
      <p className="text-sm text-[#6B7280]">
        No designers are available. Create a designer account first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <div className="flex items-center gap-3">
        <select
          name="designer_id"
          defaultValue={currentDesignerId ?? ""}
          required
          className="min-w-0 flex-1 truncate text-sm text-[#111827] bg-white border border-[#D1D5DB] rounded-md px-3 py-2 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#EFF6FF]"
        >
          <option value="" disabled>
            Select a designer…
          </option>
          {designers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
              {d.email ? ` — ${d.email}` : ""}
            </option>
          ))}
        </select>
        <SubmitButton />
      </div>
      {state.error && <p className="text-xs text-[#DC2626]">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-[#16A34A]">Designer assigned successfully.</p>
      )}
    </form>
  );
}
