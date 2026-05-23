import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SectionCard } from "@/components/ui/SectionCard";
import { NewProjectForm, type CompanyMembersMap } from "./NewProjectForm";

export const metadata: Metadata = { title: "New Project" };

export default async function AdminNewProjectPage() {
  const supabase = await createClient();

  const { data: companiesData } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });

  const companies = (companiesData ?? []) as { id: string; name: string }[];

  // Fetch all PM + Client Admin memberships across companies up-front and
  // group by company_id. This avoids a per-selection round-trip and keeps
  // the form fully client-side.
  const serviceClient = createServiceClient();

  const { data: membershipsData } = await serviceClient
    .from("company_memberships")
    .select("company_id, user_id, role")
    .eq("role", "project_manager");

  type MembershipRow = {
    company_id: string;
    user_id: string;
    role: "project_manager";
  };
  const memberships = (membershipsData ?? []) as MembershipRow[];
  const memberUserIds = Array.from(new Set(memberships.map((m) => m.user_id)));

  type ProfileRow = {
    id: string;
    display_name: string | null;
    email: string | null;
  };
  const profileMap = new Map<string, ProfileRow>();
  if (memberUserIds.length > 0) {
    const { data: profilesData } = await serviceClient
      .from("user_profiles")
      .select("id, display_name, email")
      .in("id", memberUserIds);
    for (const p of (profilesData ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p);
    }
  }

  const companyMembers: CompanyMembersMap = {};
  for (const c of companies) {
    companyMembers[c.id] = { projectManagers: [] };
  }
  for (const m of memberships) {
    const bucket = companyMembers[m.company_id];
    if (!bucket) continue;
    const profile = profileMap.get(m.user_id);
    const displayName = profile?.display_name?.trim() || null;
    const email = profile?.email?.trim() || null;
    const label = displayName || email || "(unnamed user)";
    bucket.projectManagers.push({ userId: m.user_id, displayName, email, label });
  }
  // Sort PM list per company alphabetically.
  for (const id of Object.keys(companyMembers)) {
    companyMembers[id].projectManagers.sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/projects" className="hover:text-primary transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-ink">New Project</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">New Project</h1>
        <p className="mt-0.5 text-sm text-muted">Create a project on behalf of a client company.</p>
      </div>

      <SectionCard>
        <NewProjectForm companies={companies} companyMembers={companyMembers} />
      </SectionCard>
    </div>
  );
}
