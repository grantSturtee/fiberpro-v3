import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCompanyMembership } from "@/lib/queries/projects";
import { SectionCard } from "@/components/ui/SectionCard";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  CompanyAdminRow,
  PMRow,
  AddUserForm,
  type MemberEntry,
  type AssignmentEntry,
  type ProjectOption,
} from "./CompanyTeamActions";

export const metadata: Metadata = { title: "Team" };

export default async function CompanyTeamPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const membership = await getCompanyMembership(supabase, user.id);
  if (!membership) redirect("/sign-in");

  const { company_id: companyId, role: callerRole } = membership;

  // Only company admins may manage the team
  if (callerRole !== "company_admin") {
    redirect("/company/projects");
  }

  const serviceClient = createServiceClient();

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [membershipsResult, projectsResult] = await Promise.all([
    serviceClient
      .from("company_memberships")
      .select("id, user_id, role")
      .eq("company_id", companyId)
      .order("role"),
    supabase
      .from("projects")
      .select("id, job_number, job_name")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
  ]);

  const memberships = membershipsResult.data ?? [];
  const allProjects: ProjectOption[] = (projectsResult.data ?? []).map((p) => ({
    id: p.id as string,
    jobNumber: p.job_number as string,
    jobName: p.job_name as string,
  }));

  // ── Fetch user profiles ────────────────────────────────────────────────────
  const userIds = memberships.map((m) => m.user_id);
  type ProfileRow = { id: string; display_name: string | null; email: string | null };
  const profileMap = new Map<string, ProfileRow>();

  if (userIds.length > 0) {
    const { data: profilesData } = await serviceClient
      .from("user_profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    for (const p of profilesData ?? []) profileMap.set(p.id, p as ProfileRow);
  }

  // ── Fetch PM project assignments ───────────────────────────────────────────
  const pmUserIds = memberships
    .filter((m) => m.role === "project_manager")
    .map((m) => m.user_id);

  const assignmentsByUserId = new Map<string, AssignmentEntry[]>();
  for (const uid of pmUserIds) assignmentsByUserId.set(uid, []);

  if (pmUserIds.length > 0) {
    const { data: assignmentsData } = await serviceClient
      .from("project_manager_assignments")
      .select("id, project_id, user_id")
      .in("user_id", pmUserIds);

    const projectLookup = new Map(allProjects.map((p) => [p.id, p]));
    for (const a of assignmentsData ?? []) {
      const proj = projectLookup.get(a.project_id as string);
      if (!proj) continue;
      const list = assignmentsByUserId.get(a.user_id as string) ?? [];
      list.push({
        id: a.id as string,
        projectId: a.project_id as string,
        jobNumber: proj.jobNumber,
        jobName: proj.jobName,
      });
      assignmentsByUserId.set(a.user_id as string, list);
    }
  }

  // ── Build member entries ───────────────────────────────────────────────────
  const members: MemberEntry[] = memberships.map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    role: m.role as string,
    displayName: profileMap.get(m.user_id)?.display_name ?? null,
    email: profileMap.get(m.user_id)?.email ?? null,
    isSelf: m.user_id === user.id,
    assignments: assignmentsByUserId.get(m.user_id) ?? [],
  }));

  // ── Group by role ──────────────────────────────────────────────────────────
  const companyAdmins = members.filter((m) => m.role === "company_admin");
  const pms = members.filter((m) => m.role === "project_manager");

  const adminCount = companyAdmins.length;
  const totalMembers = members.length;

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Team"
        subtitle={`${totalMembers} member${totalMembers !== 1 ? "s" : ""}`}
      />

      {/* ── A. Company Admins ─────────────────────────────────────────────── */}
      <SectionCard
        title="Company Admin"
        description="Full account control. Can manage all users and projects."
      >
        <div className="divide-y divide-surface">
          {companyAdmins.map((m) => (
            <CompanyAdminRow
              key={m.membershipId}
              member={m}
              isLastAdmin={m.role === "company_admin" && adminCount <= 1}
            />
          ))}
          {companyAdmins.length === 0 && (
            <p className="py-3 text-sm text-muted">No Company Admins.</p>
          )}
        </div>
      </SectionCard>

      {/* ── B. Project Managers ───────────────────────────────────────────── */}
      <SectionCard
        title="Project Managers"
        description="Team members who manage projects."
      >
        {pms.length > 0 ? (
          <div className="divide-y divide-surface">
            {pms.map((pm) => (
              <PMRow key={pm.membershipId} member={pm} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No Project Managers yet. Add users below.</p>
        )}
      </SectionCard>

      {/* ── C. Add User ────────────────────────────────────────────────────── */}
      <SectionCard
        title="Add User"
        description="Create or link an existing account to this company."
      >
        <AddUserForm />
      </SectionCard>
    </div>
  );
}
