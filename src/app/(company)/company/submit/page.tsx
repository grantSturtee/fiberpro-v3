import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubmitProjectForm } from "./SubmitProjectForm";

export const metadata: Metadata = { title: "Submit Project" };

// Project intake form for company-side users.
// No draft save — one submission per session.
// Fetches submitter name and company manager name server-side so the form
// can display them as read-only system-populated fields.
// On submit: server action auto-populates these fields from DB, not form.
// TODO (next phase): wire attachment uploads to Supabase Storage.

export default async function CompanySubmitPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const userId = userData.user.id;

  // Submitter name — from user_profiles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  const submitterName = profile?.display_name || userData.user.email || "You";

  // Company manager — from company_memberships, company_admin role
  let companyManagerName: string | null = null;
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", userId)
    .single();

  if (membership) {
    const { data: admins } = await supabase
      .from("company_memberships")
      .select("user_id, user_profiles ( display_name )")
      .eq("company_id", membership.company_id)
      .eq("role", "company_admin")
      .limit(1);

    if (admins && admins.length > 0) {
      const adminProfiles = admins[0].user_profiles as unknown as { display_name: string }[] | null;
      companyManagerName = Array.isArray(adminProfiles) ? (adminProfiles[0]?.display_name ?? null) : null;
    }
  }

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
          Complete all required fields. No draft saving — submit when ready.
        </p>
      </div>

      <SubmitProjectForm
        submitterName={submitterName}
        companyManagerName={companyManagerName}
      />
    </div>
  );
}
