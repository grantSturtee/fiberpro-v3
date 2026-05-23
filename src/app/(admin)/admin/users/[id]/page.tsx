import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SectionCard } from "@/components/ui/SectionCard";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import type { ProjectStatus, UnifiedProjectStatus } from "@/types/domain";

export const metadata: Metadata = { title: "View User" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  designer: "Designer",
  company_admin: "Company Admin",
  project_manager: "Project Manager",
};

export default async function AdminUserViewPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { returnTo } = await searchParams;

  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id, display_name, email, role")
    .eq("id", id)
    .single();

  if (error || !profile) notFound();

  const role = profile.role as string;
  const isCompanyUser = ["company_admin", "project_manager"].includes(role);

  // Company membership
  let companyName: string | null = null;
  let companyId: string | null = null;

  if (isCompanyUser) {
    const { data: membership } = await serviceClient
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", id)
      .single();

    if (membership) {
      companyId = membership.company_id as string;

      const { data: company } = await serviceClient
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .single();
      companyName = company?.name ?? null;
    }
  }

  // Projects — PMs see all company projects (no hierarchy)
  type ProjectRow = {
    id: string;
    job_number: string;
    job_name: string;
    status: ProjectStatus;
    unified_status: UnifiedProjectStatus;
  };

  let projects: ProjectRow[] = [];

  if (companyId && role === "project_manager") {
    const { data: projectData } = await serviceClient
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

  const safeReturnTo = returnTo && returnTo.startsWith("/admin/") ? returnTo : null;
  const backHref = safeReturnTo ?? (isCompanyUser ? "/admin/companies" : "/admin/users");

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      <div>
        <Link
          href={backHref}
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
            href={`/admin/users/${id}/edit?returnTo=/admin/users/${id}`}
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
          {companyName && (
            <div>
              <p className="text-xs font-medium text-muted mb-1">Company</p>
              <p className="text-ink">{companyName}</p>
            </div>
          )}
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
                <Link
                  key={p.id}
                  href={`/admin/projects/${p.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-surface transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors truncate">
                      {p.job_name}
                    </p>
                    <span className="text-xs font-mono text-muted">{p.job_number}</span>
                  </div>
                  <ProjectStatusBadge status={p.unified_status} />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
