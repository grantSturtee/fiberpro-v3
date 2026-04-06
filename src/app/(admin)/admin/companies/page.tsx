import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Companies" };

// TODO: Replace with Supabase query — companies table with active project counts.

const COMPANIES = [
  {
    id: "c1",
    name: "Comcast Northeast",
    slug: "comcast-northeast",
    billingEmail: "billing@comcast-ne.com",
    activeProjects: 6,
    totalProjects: 18,
    status: "active" as const,
  },
  {
    id: "c2",
    name: "Lightpath LLC",
    slug: "lightpath-llc",
    billingEmail: "permits@lightpath.com",
    activeProjects: 3,
    totalProjects: 9,
    status: "active" as const,
  },
  {
    id: "c3",
    name: "Verizon Business",
    slug: "verizon-business",
    billingEmail: "nj-permits@verizon.com",
    activeProjects: 2,
    totalProjects: 7,
    status: "active" as const,
  },
];

export default function AdminCompaniesPage() {
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <PageHeader
        title="Companies"
        subtitle="Client companies with active projects"
        action={
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            + Add Company
          </button>
        }
      />

      <div
        className="bg-card rounded-xl overflow-hidden"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-3 bg-canvas">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Company</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Billing Email</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Active</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total</span>
        </div>

        <div className="divide-y divide-surface">
          {COMPANIES.map((c) => (
            <Link
              key={c.id}
              href={`/admin/companies/${c.id}`}
              className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-4 items-center hover:bg-surface transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
                  {c.name}
                </p>
                <p className="text-xs text-muted">{c.slug}</p>
              </div>
              <p className="text-sm text-dim">{c.billingEmail}</p>
              <p className="text-sm font-medium text-ink">{c.activeProjects}</p>
              <p className="text-sm text-dim">{c.totalProjects}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
