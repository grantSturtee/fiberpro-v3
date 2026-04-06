import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Users" };

// Internal users only — admin and designer roles.
// TODO: Replace with Supabase query — users table, internal roles only.

type InternalUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "designer";
  activeProjects: number;
  status: "active" | "inactive";
};

const USERS: InternalUser[] = [
  { id: "u1", name: "Sarah Chen",     email: "s.chen@fiberpro.com",     role: "admin",    activeProjects: 0,  status: "active" },
  { id: "u2", name: "Marcus Webb",    email: "m.webb@fiberpro.com",     role: "designer", activeProjects: 4,  status: "active" },
  { id: "u3", name: "Aisha Kowalski", email: "a.kowalski@fiberpro.com", role: "designer", activeProjects: 2,  status: "active" },
];

const roleStyles: Record<InternalUser["role"], string> = {
  admin:    "bg-primary-soft text-primary",
  designer: "bg-violet-50 text-violet-700",
};

export default function AdminUsersPage() {
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <PageHeader
        title="Internal Users"
        subtitle="Admin and designer accounts"
        action={
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            + Invite User
          </button>
        }
      />

      <div
        className="bg-card rounded-xl overflow-hidden"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-3 bg-canvas">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Name</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Email</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Role</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Active Jobs</span>
        </div>

        <div className="divide-y divide-surface">
          {USERS.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-4 items-center"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-semibold text-primary">
                    {u.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <span className="text-sm font-medium text-ink">{u.name}</span>
              </div>
              <span className="text-sm text-dim">{u.email}</span>
              <span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleStyles[u.role]}`}>
                  {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                </span>
              </span>
              <span className="text-sm text-ink font-medium">{u.activeProjects}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Future: Company users section (company_admin, project_manager) managed per-company */}
      <p className="text-xs text-muted">
        Company-side users (company_admin, project_manager) are managed within each company record.
      </p>
    </div>
  );
}
