import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { AddCompanyUserForm } from "@/components/admin/AddCompanyUserForm";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Company" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminCompanyDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: company }, { data: membersData }, { data: recentProjects }] = await Promise.all([
    supabase.from("companies").select("id, name, billing_email, notes, created_at").eq("id", id).single(),
    supabase
      .from("company_memberships")
      .select("id, role, user_id, user_profiles ( display_name, email )")
      .eq("company_id", id)
      .order("created_at"),
    supabase
      .from("projects")
      .select("id, job_number, job_name, status, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!company) notFound();

  type MemberRow = {
    id: string;
    role: string;
    user_id: string;
    user_profiles: { display_name: string; email: string }[] | null;
  };

  const members = (membersData ?? []) as MemberRow[];

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/companies" className="hover:text-primary transition-colors">Companies</Link>
          <span>/</span>
          <span className="text-ink truncate">{company.name}</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
        {company.billing_email && (
          <p className="mt-0.5 text-sm text-muted">{company.billing_email}</p>
        )}
      </div>

      {/* Company info */}
      <SectionCard title="Company Info">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-muted mb-1">Billing Email</p>
            <p className="text-ink">{company.billing_email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Created</p>
            <p className="text-ink">{formatDate(company.created_at)}</p>
          </div>
          {company.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted mb-1">Notes</p>
              <p className="text-ink whitespace-pre-line">{company.notes}</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Users */}
      <SectionCard title="Users" description="Company admins and project managers">
        {members.length === 0 ? (
          <p className="text-sm text-muted py-2">No users linked to this company yet.</p>
        ) : (
          <div className="divide-y divide-surface -mx-6 -mt-2 mb-6">
            <div className="grid grid-cols-[2fr_2fr_1fr] gap-4 px-6 py-2 bg-canvas">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Name</span>
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Email</span>
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Role</span>
            </div>
            {members.map((m) => (
              <div key={m.id} className="grid grid-cols-[2fr_2fr_1fr] gap-4 px-6 py-3 items-center">
                <p className="text-sm font-medium text-ink truncate">
                {m.user_profiles?.[0]?.display_name ?? "—"}
                </p>
                <p className="text-sm text-dim truncate">{m.user_profiles?.[0]?.email ?? "—"}</p>
                <p className="text-xs text-muted capitalize">
                  {m.role.replace("_", " ")}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Add user form */}
        <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-5 mt-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Add User</p>
          <AddCompanyUserForm companyId={id} />
        </div>
      </SectionCard>

      {/* Recent projects */}
      {recentProjects && recentProjects.length > 0 && (
        <SectionCard
          title="Recent Projects"
          action={
            <Link
              href={`/admin/projects?company=${id}`}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          }
          noPad
        >
          <div className="divide-y divide-surface">
            {recentProjects.map((p) => (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-surface transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate group-hover:text-primary transition-colors">
                    {p.job_name}
                  </p>
                  <p className="text-xs font-mono text-muted mt-0.5">{p.job_number}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <ProjectStatusBadge status={p.status} />
                  <span className="text-xs text-faint hidden sm:block">{formatDate(p.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
