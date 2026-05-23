import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyMembership, getCompany } from "@/lib/queries/projects";
import { CompanySidebar } from "@/components/company/CompanySidebar";
import { CompanyTopbar } from "@/components/company/CompanyTopbar";

// Company layout: sidebar + topbar shell.
// Fetches company name, user display name, and membership role for nav gating.

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let companyName: string | undefined;
  let displayName: string | undefined;
  let initials: string | undefined;
  let companyArchived = false;
  let memberRole: string | undefined;

  try {
    const supabase = await createClient();
    // getClaims() reads JWT claims locally — no network round-trip, no token refresh.
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;

    if (claims) {
      const userId = claims.sub;
      const [membership, profileData] = await Promise.all([
        getCompanyMembership(supabase, userId),
        supabase
          .from("user_profiles")
          .select("display_name")
          .eq("id", userId)
          .single(),
      ]);

      if (membership) {
        memberRole = membership.role;
        const company = await getCompany(supabase, membership.company_id);
        companyName = company?.name ?? undefined;
        companyArchived = !!company?.archived_at;
      }

      const name = profileData.data?.display_name || (claims.email ?? "") || "";
      displayName = name;
      initials = name
        .split(" ")
        .filter(Boolean)
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?";
    }
  } catch {
    // Non-fatal — shell renders without user/company info
  }

  if (companyArchived) {
    redirect("/company-disabled");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <CompanySidebar role={memberRole} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <CompanyTopbar
          companyName={companyName}
          displayName={displayName}
          initials={initials}
        />
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
