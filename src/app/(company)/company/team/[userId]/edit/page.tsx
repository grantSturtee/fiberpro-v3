import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCompanyMembership } from "@/lib/queries/projects";
import { SectionCard } from "@/components/ui/SectionCard";
import { CompanyEditUserForm } from "./CompanyEditUserForm";

export const metadata: Metadata = { title: "Edit User" };

type Props = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function CompanyTeamEditPage({ params, searchParams }: Props) {
  const { userId } = await params;
  const { returnTo } = await searchParams;
  const backHref = returnTo ?? `/company/team/${userId}`;

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Only company_admin can edit team member profiles
  const callerMembership = await getCompanyMembership(supabase, user.id);
  if (!callerMembership || callerMembership.role !== "company_admin") {
    redirect("/company/projects");
  }
  const { company_id: companyId } = callerMembership;

  const serviceClient = createServiceClient();

  // Security: target must belong to the same company
  const { data: targetMembership } = await serviceClient
    .from("company_memberships")
    .select("id, role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .single();

  if (!targetMembership) notFound();

  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("id, display_name, email, role")
    .eq("id", userId)
    .single();

  if (!profile) notFound();

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors mb-3"
        >
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </Link>
        <h1 className="text-xl font-semibold text-ink">Edit User</h1>
        <p className="mt-0.5 text-sm text-muted">
          {(profile.display_name as string | null) ?? "—"}
        </p>
      </div>

      <SectionCard>
        <CompanyEditUserForm
          user={{
            id: profile.id as string,
            display_name: (profile.display_name as string) ?? "",
            email: (profile.email as string | null) ?? null,
            role: profile.role as string,
          }}
          returnTo={backHref}
        />
      </SectionCard>
    </div>
  );
}
