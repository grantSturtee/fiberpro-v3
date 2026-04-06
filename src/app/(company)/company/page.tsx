import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import {
  getCompanyIdForUser,
  getCompany,
  getCompanyProjectList,
} from "@/lib/queries/projects";
import { ACTIVE_STATUSES } from "@/lib/constants/project";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function CompanyDashboardPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const companyId = await getCompanyIdForUser(supabase, userData.user.id);
  if (!companyId) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-sm text-muted">
          Your account is not associated with a company. Contact your administrator.
        </p>
      </div>
    );
  }

  const [company, projects] = await Promise.all([
    getCompany(supabase, companyId),
    getCompanyProjectList(supabase, companyId),
  ]);

  const active = projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length;
  const recent = projects.slice(0, 6);

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">

      {/* Welcome bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">{company?.name ?? "Your Company"}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {active} active project{active !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/company/submit"
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          + Submit Project
        </Link>
      </div>

      {/* Project list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Recent Projects
          </h2>
          <Link href="/company/projects" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <div
            className="bg-card rounded-xl px-6 py-12 text-center"
            style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
          >
            <p className="text-sm font-medium text-ink mb-1">No projects yet</p>
            <p className="text-xs text-muted mb-4">
              Submit your first project to get started.
            </p>
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
            <div className="divide-y divide-surface">
              {recent.map((p) => (
                <Link
                  key={p.id}
                  href={`/company/projects/${p.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors truncate">
                      {p.job_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                      <span className="font-mono">{p.job_number}</span>
                      {p.county && (
                        <>
                          <span className="text-faint">·</span>
                          <span>{p.county} County</span>
                        </>
                      )}
                      <span className="text-faint">·</span>
                      <span>{formatDate(p.created_at)}</span>
                    </div>
                  </div>
                  <ProjectStatusBadge status={p.status} variant="external" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
