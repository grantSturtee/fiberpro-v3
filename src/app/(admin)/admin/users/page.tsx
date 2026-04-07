import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { CreateUserForm } from "@/components/admin/CreateUserForm";

export const metadata: Metadata = { title: "Users" };

const roleStyles: Record<string, string> = {
  admin:    "bg-primary-soft text-primary",
  designer: "bg-violet-50 text-violet-700",
};

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const [{ data: usersData }, { data: projectsData }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id, display_name, email, role")
      .in("role", ["admin", "designer"])
      .order("display_name"),
    supabase
      .from("projects")
      .select("assigned_designer_id, status")
      .not("assigned_designer_id", "is", null)
      .in("status", ["assigned", "in_design", "revisions_required", "waiting_for_admin_review"]),
  ]);

  const users = usersData ?? [];

  // Count active projects per designer
  const activeMap: Record<string, number> = {};
  for (const p of projectsData ?? []) {
    const did = p.assigned_designer_id as string;
    activeMap[did] = (activeMap[did] ?? 0) + 1;
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Internal Users"
        subtitle={`${users.length} admin and designer account${users.length !== 1 ? "s" : ""}`}
      />

      <div
        className="bg-card rounded-xl overflow-hidden"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        {/* Table header */}
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-canvas">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Name</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Email</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Role</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Active Jobs</span>
          <span />
        </div>

        {users.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted">No internal users found.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface">
            {users.map((u) => {
              const initials = u.display_name
                .split(" ")
                .filter(Boolean)
                .map((n: string) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={u.id}
                  className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-4 px-5 py-4 items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-semibold text-primary">{initials}</span>
                    </div>
                    <span className="text-sm font-medium text-ink truncate">{u.display_name}</span>
                  </div>
                  <span className="text-sm text-dim truncate">{u.email}</span>
                  <span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleStyles[u.role] ?? "bg-wash text-muted"}`}>
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {u.role === "designer" ? (activeMap[u.id] ?? 0) : "—"}
                  </span>
                  <Link
                    href={`/admin/users/${u.id}/edit`}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create user */}
      <SectionCard title="Create Internal User" description="Add a new admin or designer account">
        <CreateUserForm />
      </SectionCard>

      <p className="text-xs text-muted">
        Company-side users (company_admin, project_manager) are managed within each company record.
      </p>
    </div>
  );
}
