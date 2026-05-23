"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { addCompanyUser, type CompanyActionState } from "@/app/(admin)/admin/companies/[id]/actions";

const initialState: CompanyActionState = { error: null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SubmitButton({ canAdd }: { canAdd: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || !canAdd;
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
      {pending ? "Adding…" : "Add User"}
    </button>
  );
}

export function AddCompanyUserForm({
  companyId,
}: {
  companyId: string;
}) {
  const [state, formAction] = useActionState(addCompanyUser, initialState);
  const [formKey, setFormKey] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  // Validation state
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canAdd =
    displayName.trim().length > 0 &&
    EMAIL_RE.test(email) &&
    password.length >= 8;

  useEffect(() => {
    if (state.success) {
      setFormKey((k) => k + 1);
      setShowSuccess(true);
      setDisplayName("");
      setEmail("");
      setPassword("");
    } else if (state.error) {
      setShowSuccess(false);
    }
  }, [state]);

  const inputCls =
    "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
  const borderStyle = { border: "1px solid #d4dde4" };
  const labelCls = "block text-xs font-medium text-dim mb-1.5";

  return (
    <div className="space-y-4">
      {showSuccess && (
        <div className="rounded-lg bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700 font-medium">User added successfully.</p>
          <p className="text-xs text-green-600 mt-0.5">
            They can now sign in with their email and the password you set.
          </p>
        </div>
      )}

      <form key={formKey} className="space-y-4" action={formAction}>
        <input type="hidden" name="company_id" value={companyId} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="cu-display-name">
              Display Name
            </label>
            <input
              id="cu-display-name"
              name="display_name"
              type="text"
              required
              placeholder="e.g. Jane Smith"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
              style={borderStyle}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="cu-email">
              Email
            </label>
            <input
              id="cu-email"
              name="email"
              type="email"
              required
              placeholder="jane@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              style={borderStyle}
            />
          </div>

          <input type="hidden" name="role" value="project_manager" />

          <div>
            <label className={labelCls} htmlFor="cu-password">
              Password
            </label>
            <input
              id="cu-password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              style={borderStyle}
            />
          </div>

        </div>

        {state.error && (
          <div className="rounded-lg bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <SubmitButton canAdd={canAdd} />
        </div>
      </form>
    </div>
  );
}
