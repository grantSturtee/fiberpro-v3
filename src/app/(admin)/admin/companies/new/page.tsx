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
        <p className="mt-0.5 text-sm text-muted">Create a new client company account.</p>
      </div>

      <div
        className="bg-card rounded-xl p-6"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <form className="space-y-5" action={formAction}>
          <div>
            <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="name">
              Company Name<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Comcast Northeast"
              className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                         outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
              style={{ border: "1px solid #d4dde4" }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="billing_email">
              Billing Email
            </label>
            <input
              id="billing_email"
              name="billing_email"
              type="email"
              placeholder="e.g. billing@company.com"
              className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                         outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
              style={{ border: "1px solid #d4dde4" }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dim mb-1.5" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Internal notes about this company…"
              className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                         outline-none resize-none transition-shadow focus:ring-2 focus:ring-primary/20"
              style={{ border: "1px solid #d4dde4" }}
            />
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
