import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ACTIVE_STATUSES } from "@/lib/constants/project";

export const metadata: Metadata = { title: "Companies" };

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const showArchived = show === "archived";

  const supabase = await createClient();

  let companiesQuery = supabase
    .from("companies")
    .select("id, name, billing_email, archived_at")
    .order("name");

  companiesQuery = showArchived
    ? companiesQuery.not("archived_at", "is", null)
    : companiesQuery.is("archived_at", null);

  const [{ data: companiesData }, { data: projectsData }] = await Promise.all([
    companiesQuery,
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

  const subtitle = showArchived
    ? `${companies.length} archived compan${companies.length !== 1 ? "ies" : "y"}`
    : `${companies.length} active compan${companies.length !== 1 ? "ies" : "y"}`;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Companies"
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={showArchived ? "/admin/companies" : "/admin/companies?show=archived"}
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              {showArchived ? "← Active companies" : "Show archived"}
            </Link>
            {!showArchived && (
              <Link
                href="/admin/companies/new"
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
              >
                + Add Company
              </Link>
            )}
          </div>
        }
      />

      {companies.length === 0 ? (
        <div
          className="bg-card rounded-xl px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">
            {showArchived ? "No archived companies." : "No companies yet."}
          </p>
          {!showArchived && (
            <Link href="/admin/companies/new" className="mt-3 inline-block text-sm text-primary hover:underline">
              Add the first company
            </Link>
          )}
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
                <div className="flex items-center gap-2 min-w-0">
                  <p className={`text-sm font-medium transition-colors truncate ${c.archived_at ? "text-muted" : "text-ink group-hover:text-primary"}`}>
                    {c.name}
                  </p>
                  {c.archived_at && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-surface text-muted border border-surface">
                      Archived
                    </span>
                  )}
                </div>
                <p className={`text-sm truncate ${c.archived_at ? "text-faint" : "text-dim"}`}>
                  {c.billing_email ?? "—"}
                </p>
                <p className={`text-sm font-medium ${c.archived_at ? "text-faint" : "text-ink"}`}>
                  {activeMap[c.id] ?? 0}
                </p>
                <p className={`text-sm ${c.archived_at ? "text-faint" : "text-dim"}`}>
                  {totalMap[c.id] ?? 0}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
