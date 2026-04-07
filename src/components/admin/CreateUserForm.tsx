"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createInternalUser, type CreateUserState } from "@/app/(admin)/admin/users/actions";

const initialState: CreateUserState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Creating…" : "Create User"}
    </button>
  );
}

export function CreateUserForm() {
  const [state, formAction] = useActionState(createInternalUser, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">User created successfully.</p>
        <p className="text-xs text-green-600 mt-0.5">
          They can now sign in with their email and the password you set.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={formAction}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="iu-name">
            Display Name<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="iu-name"
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
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="iu-email">
            Email<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="iu-email"
            name="email"
            type="email"
            required
            placeholder="jane@fiberpro.com"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                       outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="iu-role">
            Role<span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            id="iu-role"
            name="role"
            required
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink
                       outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
            style={{ border: "1px solid #d4dde4" }}
          >
            <option value="">Select…</option>
            <option value="designer">Designer</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="iu-password">
            Password<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="iu-password"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                       outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="iu-confirm">
            Confirm Password<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="iu-confirm"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            placeholder="Re-enter password"
            autoComplete="new-password"
            className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                       outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
          />
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
