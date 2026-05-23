import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCompanyMembership } from "@/lib/queries/projects";
import { SectionCard } from "@/components/ui/SectionCard";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import type { ProjectStatus, UnifiedProjectStatus } from "@/types/domain";

export const metadata: Metadata = { title: "View User" };

type Props = { params: Promise<{ userId: string }> };

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  project_manager: "Project Manager",
};

export default async function CompanyTeamViewPage({ params }: Props) {
  const { userId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Only company_admin can view team member profiles
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

  const [profileResult, companyResult] = await Promise.all([
    serviceClient.from("user_profiles").select("id, display_name, email").eq("id", userId).single(),
    serviceClient.from("companies").select("name").eq("id", companyId).single(),
  ]);

  if (!profileResult.data) notFound();
  const profile = profileResult.data;
  const companyName = companyResult.data?.name ?? null;
  const role = targetMembership.role as string;

  // Projects — PMs see all company projects (no hierarchy)
  type ProjectRow = {
    id: string;
    job_number: string;
    job_name: string;
    status: ProjectStatus;
    unified_status: UnifiedProjectStatus;
  };

  let projects: ProjectRow[] = [];

  if (role === "project_manager") {
    const { data: projectData } = await supabase
      .from("projects")
      .select("id, job_number, job_name, status, unified_status")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    projects = (projectData ?? []).map((p) => ({
      id: p.id as string,
      job_number: p.job_number as string,
      job_name: p.job_name as string,
      status: p.status as ProjectStatus,
      unified_status: p.unified_status as UnifiedProjectStatus,
    }));
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      <div>
        <Link
          href="/company/team"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors mb-3"
        >
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              {(profile.display_name as string | null) ?? "Unknown User"}
            </h1>
            {(profile.email as string | null) && (
              <p className="mt-0.5 text-sm text-muted">{profile.email as string}</p>
            )}
          </div>
          <Link
            href={`/company/team/${userId}/edit`}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            Edit
          </Link>
        </div>
      </div>

      <SectionCard title="Profile">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div>
            <p className="text-xs font-medium text-muted mb-1">Role</p>
            <p className="text-ink">{ROLE_LABELS[role] ?? role}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Company</p>
            <p className="text-ink">{companyName ?? "—"}</p>
          </div>
          {role === "project_manager" && (
            <div>
              <p className="text-xs font-medium text-muted mb-1">Projects</p>
              <p className="text-ink">{projects.length}</p>
            </div>
          )}
        </div>
      </SectionCard>

      {role === "project_manager" && (
        <SectionCard title="Projects" noPad>
          {projects.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted">No projects found.</p>
          ) : (
            <div className="divide-y divide-surface">
              {projects.map((p) => (
                <div key={p.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{p.job_name}</p>
                    <span className="text-xs font-mono text-muted">{p.job_number}</span>
                  </div>
                  <ProjectStatusBadge status={p.unified_status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
