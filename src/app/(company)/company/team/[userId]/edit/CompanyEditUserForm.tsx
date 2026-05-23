"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateCompanyUser, type EditUserState } from "./actions";

type UserProps = {
  id: string;
  display_name: string;
  email: string | null;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  project_manager: "Project Manager",
};

const initialState: EditUserState = { error: null };

function SubmitButton({ canSave }: { canSave: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || !canSave;
  return (
    <button
      type="submit"
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
      style={
        !disabled
          ? { background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)", color: "white" }
          : { background: "#e3e9ec", color: "#9ba8b4" }
      }
    >
      {pending ? "Saving…" : "Save Changes"}
    </button>
  );
}

export function CompanyEditUserForm({
  user,
  returnTo,
}: {
  user: UserProps;
  returnTo: string;
}) {
  const [state, formAction] = useActionState(updateCompanyUser, initialState);

  const [displayName, setDisplayName] = useState(user.display_name);
  const [email, setEmail] = useState(user.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const isDirty =
    displayName !== user.display_name ||
    email !== (user.email ?? "") ||
    newPassword !== "" ||
    confirmPassword !== "";

  const passwordsFilled = newPassword.length > 0 || confirmPassword.length > 0;
  const passwordsValid =
    !passwordsFilled ||
    (newPassword.length >= 8 && confirmPassword.length >= 8 && newPassword === confirmPassword);
  const passwordMismatch =
    passwordsFilled && newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;

  const isValid =
    displayName.trim().length > 0 &&
    email.trim().length > 0 &&
    passwordsValid;

  const canSave = isDirty && isValid;

  const inputCls =
    "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
  const borderStyle = { border: "1px solid #d4dde4" };
  const labelCls = "block text-xs font-medium text-dim mb-1.5";

  return (
    <form className="space-y-5" action={formAction}>
      <input type="hidden" name="user_id" value={user.id} />
      <input type="hidden" name="return_to" value={returnTo} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Display Name</label>
          <input
            name="display_name"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputCls}
            style={borderStyle}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Email</label>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            style={borderStyle}
          />
          <p className="mt-1 text-xs text-muted">
            Email changes affect the user&apos;s login credentials.
          </p>
        </div>

        <div>
          <label className={labelCls}>Role</label>
          <p className="text-sm text-ink px-3.5 py-2.5 bg-canvas rounded-lg" style={borderStyle}>
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </div>

      </div>

      <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-5 space-y-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Change Password</p>
        <div className="-mt-2 space-y-0.5">
          <p className="text-xs text-amber-700 font-medium">
            Changing the password affects the user&apos;s login immediately.
          </p>
          <p className="text-xs text-muted">Leave blank to keep the existing password.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>New Password</label>
            <input
              name="new_password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder="Min 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
              style={borderStyle}
            />
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <input
              name="confirm_new_password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
              style={borderStyle}
            />
          </div>
        </div>
        {passwordMismatch && (
          <p className="text-xs text-red-600 -mt-2">Passwords do not match.</p>
        )}
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div
        className="flex items-center justify-between pt-2"
        style={{ borderTop: "1px solid #e3e9ec" }}
      >
        <Link href={returnTo} className="text-sm text-dim hover:text-ink transition-colors">
          Cancel
        </Link>
        <SubmitButton canSave={canSave} />
      </div>
    </form>
  );
}
