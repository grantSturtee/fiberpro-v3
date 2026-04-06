"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addCompanyUser, type CompanyActionState } from "@/app/(admin)/admin/companies/[id]/actions";

const initialState: CompanyActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Adding…" : "Add User"}
    </button>
  );
}

export function AddCompanyUserForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useActionState(addCompanyUser, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">User added successfully.</p>
        <p className="text-xs text-green-600 mt-0.5">
          They can sign in with the email address provided. A password reset email may be required.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={formAction}>
      <input type="hidden" name="company_id" value={companyId} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="cu-display-name">
            Display Name<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="cu-display-name"
            name="display_name"
            type="text"
            required
            placeholder="e.g. Jane Smith"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                       outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="cu-email">
            Email<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="cu-email"
            name="email"
            type="email"
            required
            placeholder="jane@company.com"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                       outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="cu-role">
            Role<span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            id="cu-role"
            name="role"
            required
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                       outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
            style={{ border: "1px solid #d4dde4" }}
          >
            <option value="">Select role…</option>
            <option value="company_admin">Company Admin</option>
            <option value="project_manager">Project Manager</option>
          </select>
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
