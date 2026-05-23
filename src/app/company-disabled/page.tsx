import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account Disabled" };

// Shown when a company user attempts to access the portal
// and their company has been archived by an admin.
// This page is intentionally outside the (company) route group
// to avoid the company layout re-evaluating the archived state
// and causing an infinite redirect loop.

export default function CompanyDisabledPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div
          className="bg-card rounded-xl px-8 py-12"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-2xl mb-4">🔒</p>
          <h1 className="text-base font-semibold text-ink mb-2">Account Disabled</h1>
          <p className="text-sm text-muted">
            Your company account has been disabled. Please contact GRANTED support to restore access.
          </p>
        </div>
      </div>
    </div>
  );
}
