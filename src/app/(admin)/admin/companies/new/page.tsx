"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createCompany, type NewCompanyState } from "./actions";

const initialState: NewCompanyState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Creating…" : "Create Company"}
    </button>
  );
}

const inputCls =
  "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
const inputStyle = { border: "1px solid #d4dde4" };
const labelCls = "block text-xs font-medium text-dim mb-1.5";

export default function AdminNewCompanyPage() {
  const [state, formAction] = useActionState(createCompany, initialState);

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/companies" className="hover:text-primary transition-colors">Companies</Link>
          <span>/</span>
          <span className="text-ink">New Company</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Add Company</h1>
        <p className="mt-0.5 text-sm text-muted">Create a new client company and its initial admin account.</p>
      </div>

      <div
        className="bg-card rounded-xl p-6 space-y-6"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <form className="space-y-6" action={formAction}>

          {/* ── Company Details ─────────────────────────────────────────── */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Company Details</h2>

            <div>
              <label className={labelCls} htmlFor="name">
                Company Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g. Comcast Northeast"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="billing_email">
                Billing Email
              </label>
              <input
                id="billing_email"
                name="billing_email"
                type="email"
                placeholder="e.g. billing@company.com"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Internal notes about this company…"
                className={`${inputCls} resize-none`}
                style={inputStyle}
              />
            </div>
          </div>

          {/* ── Company Admin ────────────────────────────────────────────── */}
          <div className="space-y-4 pt-2" style={{ borderTop: "1px solid #e3e9ec" }}>
            <div>
              <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Company Admin</h2>
              <p className="mt-0.5 text-xs text-muted">This user will be created as the first admin for the company.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls} htmlFor="admin_display_name">
                  Display Name<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  id="admin_display_name"
                  name="admin_display_name"
                  type="text"
                  required
                  placeholder="e.g. Jane Smith"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="admin_email">
                  Email<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  id="admin_email"
                  name="admin_email"
                  type="email"
                  required
                  placeholder="jane@company.com"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="admin_password">
                  Temporary Password<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  id="admin_password"
                  name="admin_password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {state.error && (
            <div className="rounded-lg bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{state.error}</p>
            </div>
          )}

          <div
            className="flex items-center justify-between gap-4 pt-2"
            style={{ borderTop: "1px solid #e3e9ec" }}
          >
            <Link href="/admin/companies" className="text-sm text-dim hover:text-ink transition-colors">
              Cancel
            </Link>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
