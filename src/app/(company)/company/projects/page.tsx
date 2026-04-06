import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import {
  getCompanyIdForUser,
  getCompanyProjectList,
} from "@/lib/queries/projects";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Projects" };

export default async function CompanyProjectsPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const companyId = await getCompanyIdForUser(supabase, userData.user.id);
  if (!companyId) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <p className="text-sm text-muted">
          Your account is not associated with a company. Contact your administrator.
        </p>
      </div>
    );
  }

  const projects = await getCompanyProjectList(supabase, companyId);

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="All Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? "s" : ""}`}
        action={
          <Link
            href="/company/submit"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            + Submit Project
          </Link>
        }
      />

      {projects.length === 0 ? (
        <div
          className="bg-card rounded-xl px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm font-medium text-ink mb-1">No projects yet</p>
          <p className="text-xs text-muted mb-4">Submit your first project to get started.</p>
          <Link
            href="/company/submit"
            className="inline-block px-4 py-2 rounded-lg text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            Submit Project
          </Link>
        </div>
      ) : (
        <div
          className="bg-card rounded-xl overflow-hidden"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-canvas">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Project</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Authority</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Status</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Submitted</span>
          </div>

          <div className="divide-y divide-surface">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/company/projects/${p.id}`}
                className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-4 items-center hover:bg-surface transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors truncate">
                    {p.job_name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                    <span className="font-mono">{p.job_number}</span>
                    {p.job_number_client && (
                      <>
                        <span className="text-faint">·</span>
                        <span>{p.job_number_client}</span>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm text-dim">
                  {p.county ? `${p.county} County` : p.authority_type ?? "—"}
                </p>
                <ProjectStatusBadge status={p.status} variant="external" />
                <p className="text-xs text-muted">{formatDate(p.created_at)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
