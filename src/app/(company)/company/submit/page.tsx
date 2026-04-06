import type { Metadata } from "next";
import Link from "next/link";
import { SubmitProjectForm } from "./SubmitProjectForm";

export const metadata: Metadata = { title: "Submit Project" };

// Project intake form for company-side users.
// No draft save — one submission per session.
// Submits to: submitProject() server action → creates project record → redirects to project detail.
// TODO (next phase): wire attachment uploads to Supabase Storage.

export default function CompanySubmitPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-1.5 mb-2">
          <Link href="/company" className="text-xs text-muted hover:text-dim transition-colors">
            Dashboard
          </Link>
          <span className="text-xs text-faint">/</span>
          <span className="text-xs text-muted">Submit Project</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Submit a New Project</h1>
        <p className="mt-1 text-sm text-muted">
          All fields marked required must be completed. No draft saving — submit when ready.
        </p>
      </div>

      <SubmitProjectForm />
    </div>
  );
}
