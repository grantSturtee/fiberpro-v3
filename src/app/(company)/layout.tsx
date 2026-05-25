import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyMembership, getCompany } from "@/lib/queries/projects";
import { CompanySidebar } from "@/components/company/CompanySidebar";
import { CompanyTopbar } from "@/components/company/CompanyTopbar";

// Company layout: sidebar + topbar shell.
// Fetches user profile (display name, role, avatar) and company name.

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let companyName: string | undefined;
  let companyArchived = false;
  let displayName = "User";
  let role = "project_manager";
  let avatarUrl: string | null = null;

  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;

    if (claims) {
      const userId = claims.sub;

      // Core profile — display name and role only. Must never be broken by
      // schema additions.
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name, role")
        .eq("id", userId)
        .single();

      // Avatar URL — separate query so a missing column cannot affect
      // display name resolution.
      const { data: avatarData } = await supabase
        .from("user_profiles")
        .select("avatar_url")
        .eq("id", userId)
        .single();

      const metaDisplayName = (claims.user_metadata?.display_name as string | undefined)?.trim();
      displayName =
        profile?.display_name?.trim() ||
        metaDisplayName ||
        claims.email ||
        "User";

      const membership = await getCompanyMembership(supabase, userId);
      if (membership) {
        role = membership.role;
        const company = await getCompany(supabase, membership.company_id);
        companyName = company?.name ?? undefined;
        companyArchived = !!company?.archived_at;
      } else if (profile?.role) {
        role = profile.role;
      }

      // Convert stored avatar path to a signed URL. Falls back to null
      // (initials) if absent or signing fails.
      if (avatarData?.avatar_url) {
        const { data: signed } = await supabase.storage
          .from("avatars")
          .createSignedUrl(avatarData.avatar_url, 3600);
        avatarUrl = signed?.signedUrl ?? null;
      }
    }
  } catch {
    // Non-fatal — shell renders with defaults
  }

  if (companyArchived) {
    redirect("/company-disabled");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <CompanySidebar user={{ displayName, role, avatarUrl }} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <CompanyTopbar companyName={companyName} />
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
