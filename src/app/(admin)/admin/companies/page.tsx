import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ACTIVE_STATUSES } from "@/lib/constants/project";

export const metadata: Metadata = { title: "Companies" };

export default async function AdminCompaniesPage() {
  const supabase = await createClient();

  const [{ data: companiesData }, { data: projectsData }] = await Promise.all([
    supabase.from("companies").select("id, name, billing_email").order("name"),
    supabase.from("projects").select("company_id, status"),
  ]);

  const companies = companiesData ?? [];
  const projects = projectsData ?? [];

  const activeSet = new Set(ACTIVE_STATUSES as string[]);

  // Build count maps
  const totalMap: Record<string, number> = {};
  const activeMap: Record<string, number> = {};
  for (const p of projects) {
    const cid = p.company_id as string;
    totalMap[cid] = (totalMap[cid] ?? 0) + 1;
    if (activeSet.has(p.status as string)) {
      activeMap[cid] = (activeMap[cid] ?? 0) + 1;
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} client compan${companies.length !== 1 ? "ies" : "y"}`}
        action={
          <Link
            href="/admin/companies/new"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            + Add Company
          </Link>
        }
      />

      {companies.length === 0 ? (
        <div
          className="bg-card rounded-xl px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">No companies yet.</p>
          <Link href="/admin/companies/new" className="mt-3 inline-block text-sm text-primary hover:underline">
            Add the first company
          </Link>
        </div>
      ) : (
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
            {companies.map((c) => (
              <Link
                key={c.id}
                href={`/admin/companies/${c.id}`}
                className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-4 items-center hover:bg-surface transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
                    {c.name}
                  </p>
                </div>
                <p className="text-sm text-dim truncate">{c.billing_email ?? "—"}</p>
                <p className="text-sm font-medium text-ink">{activeMap[c.id] ?? 0}</p>
                <p className="text-sm text-dim">{totalMap[c.id] ?? 0}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
