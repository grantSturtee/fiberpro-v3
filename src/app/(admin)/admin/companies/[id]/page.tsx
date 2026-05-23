import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SectionCard } from "@/components/ui/SectionCard";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { AddCompanyUserForm } from "@/components/admin/AddCompanyUserForm";
import { RemoveCompanyMemberButton } from "@/components/admin/RemoveCompanyMemberButton";
import { ArchiveCompanyButton, UnarchiveCompanyButton } from "@/components/admin/ArchiveCompanyButton";
import { AllowedStatesForm } from "./AllowedStatesForm";
import { CompanyLogoForm } from "./CompanyLogoForm";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Company" };

type Props = { params: Promise<{ id: string }> };

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
    </svg>
  );
}

export default async function AdminCompanyDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // The core company select uses ONLY columns that have existed since before
  // Phase D. logo_path is fetched separately below so a missing column or
  // stale PostgREST schema cache can't 404 the whole page. Same for the
  // membership / projects / billing queries — none of them touch logo_path.
  const [{ data: company, error: companyError }, { data: membershipsData }, { data: recentProjects }, { data: billingProjects }] = await Promise.all([
    supabase.from("companies").select("id, name, billing_email, notes, created_at, allowed_states, archived_at, archived_by").eq("id", id).single(),
    supabase.from("company_memberships").select("id, role, user_id").eq("company_id", id).order("created_at"),
    supabase.from("projects").select("id, job_number, job_name, status, unified_status, created_at").eq("company_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("projects").select("id, base_price, discount_amount, invoice_sent_at, invoice_paid_at").eq("company_id", id),
  ]);

  if (companyError) {
    console.error("Company detail query error:", companyError);
  }
  if (!company) {
    // Distinguish "row not found" (legitimate 404) from "query failed".
    // companyError = null   → row genuinely doesn't exist (notFound is correct).
    // companyError set      → DB error; surface the reason in logs before 404.
    console.warn(
      "[admin/companies/[id]] notFound triggered. id:",
      id,
      "companyError:",
      companyError ?? null,
    );
    notFound();
  }

  // Fetch logo_path separately so a missing column / stale schema cache /
  // RLS quirk on the new field can't 404 the whole page. If this fails, the
  // logo card simply shows the "No logo uploaded" empty state.
  let companyLogoPath: string | null = null;
  try {
    const { data: logoRow, error: logoErr } = await supabase
      .from("companies")
      .select("logo_path")
      .eq("id", id)
      .maybeSingle();
    if (logoErr) {
      console.warn("[admin/companies/[id]] logo_path lookup failed (treating as no logo):", logoErr.message);
    } else {
      companyLogoPath = (logoRow as { logo_path: string | null } | null)?.logo_path ?? null;
    }
  } catch (e) {
    console.warn("[admin/companies/[id]] logo_path lookup threw (treating as no logo):", e);
  }

  const memberships = membershipsData ?? [];
  const userIds = memberships.map((m) => m.user_id);

  type ProfileRow = { id: string; display_name: string | null; email: string | null };
  const profileMap = new Map<string, ProfileRow>();

  const serviceClient = createServiceClient();

  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await serviceClient
      .from("user_profiles")
      .select("id, display_name, email")
      .in("id", userIds);

    if (profilesError) {
      console.error("Company user profiles fetch error:", profilesError);
    }

    for (const p of profilesData ?? []) {
      profileMap.set(p.id, p as ProfileRow);
    }
  }

  // Resolve archiving admin display name for banner
  let archivedByName: string | null = null;
  const archivedByUid = company.archived_by as string | null;
  if (archivedByUid) {
    const { data: archiverProfile } = await serviceClient
      .from("user_profiles")
      .select("display_name")
      .eq("id", archivedByUid)
      .single();
    archivedByName = archiverProfile?.display_name ?? null;
  }

  const members = memberships.map((m) => {
    const profile = profileMap.get(m.user_id);
    return {
      membershipId: m.id,
      userId: m.user_id,
      role: m.role as string,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? null,
    };
  });

  // Phase D — sign the company logo URL for the in-page preview. Bucket is
  // private + admin-only, so the service client signs a short-lived URL.
  // companyLogoPath was fetched in its own try/catch above, so anything that
  // could go wrong with the new logo_path column is already isolated. If the
  // storage call itself fails (object missing, bucket gone, network blip) we
  // still render the page; the card just shows the empty state.
  let companyLogoSignedUrl: string | null = null;
  if (companyLogoPath) {
    try {
      const { data: signed, error: signErr } = await serviceClient.storage
        .from("company-assets")
        .createSignedUrl(companyLogoPath, 60 * 60); // 1 hour
      if (signErr) {
        console.warn("[admin/companies/[id]] sign logo URL failed:", signErr.message);
      } else {
        companyLogoSignedUrl = signed?.signedUrl ?? null;
      }
    } catch (e) {
      console.warn("[admin/companies/[id]] sign logo URL threw:", e);
    }
  }

  const isArchived = !!company.archived_at;

  // Group members by role
  const companyAdmin = members.find((m) => m.role === "company_admin") ?? null;
  const pms = members.filter((m) => m.role === "project_manager");

  // Billing summary
  const allProjects = billingProjects ?? [];
  const totalProjects = allProjects.length;

  let totalBilled = 0;
  let invoicesSent = 0;
  let invoicesPaid = 0;
  let outstandingInvoices = 0;
  let outstandingAmount = 0;

  for (const p of allProjects) {
    const net = (p.base_price ?? 0) - (p.discount_amount ?? 0);
    if (p.base_price != null) totalBilled += net;
    const sent = p.invoice_sent_at != null;
    const paid = p.invoice_paid_at != null;
    if (sent) invoicesSent++;
    if (paid) invoicesPaid++;
    if (sent && !paid) {
      outstandingInvoices++;
      outstandingAmount += net;
    }
  }

  const formatUSD = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);

  const returnToParam = `?returnTo=${encodeURIComponent(`/admin/companies/${id}`)}`;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <Link
          href="/admin/companies"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors mb-3"
        >
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
            {company.billing_email && (
              <p className="mt-0.5 text-sm text-muted">{company.billing_email}</p>
            )}
          </div>
          <div className="flex-shrink-0">
            {isArchived ? (
              <UnarchiveCompanyButton companyId={id} />
            ) : (
              <ArchiveCompanyButton companyId={id} />
            )}
          </div>
        </div>
      </div>

      {/* Archived banner */}
      {isArchived && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">This company is archived</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Archived {formatDate(company.archived_at as string)}
            {archivedByName ? ` by ${archivedByName}` : ""}
            {" "}— company users cannot access the portal or submit new projects.
          </p>
        </div>
      )}

      {/* Company info — company admin + (no notes/created/billing clutter) */}
      <SectionCard title="Company Info">
        <div className="text-sm">
          <p className="text-xs font-medium text-muted mb-2">Company Admin</p>
          {companyAdmin ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{companyAdmin.displayName ?? "—"}</p>
                {companyAdmin.email && (
                  <p className="text-xs text-muted mt-0.5">{companyAdmin.email}</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Link
                  href={`/admin/users/${companyAdmin.userId}${returnToParam}`}
                  title="View Company Admin"
                  className="p-1 rounded text-faint hover:text-primary hover:bg-primary-soft transition-colors"
                >
                  <EyeIcon />
                </Link>
                <Link
                  href={`/admin/users/${companyAdmin.userId}/edit${returnToParam}`}
                  title="Edit Company Admin"
                  className="p-1 rounded text-faint hover:text-primary hover:bg-primary-soft transition-colors"
                >
                  <PencilIcon />
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-faint">Not assigned</p>
          )}
        </div>
      </SectionCard>

      {/* Company logo (Phase D) */}
      <SectionCard
        title="Company Logo"
        description="Used as the per-company logo in generated PDFs (cover sheets and any image_region bound to “Company Logo”)."
      >
        <CompanyLogoForm
          companyId={company.id}
          currentLogoUrl={companyLogoSignedUrl}
        />
      </SectionCard>

      {/* Billing summary */}
      <SectionCard title="Billing Summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5 text-sm">
          <div>
            <p className="text-xs font-medium text-muted mb-1">Total Projects</p>
            <p className="text-ink font-semibold">{totalProjects}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Total Billed</p>
            <p className="text-ink font-semibold">{formatUSD(totalBilled)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Outstanding Amount</p>
            <p className={`font-semibold ${outstandingAmount > 0 ? "text-amber-600" : "text-ink"}`}>
              {formatUSD(outstandingAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Invoices Paid</p>
            <p className="text-ink font-semibold">{invoicesPaid}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Outstanding Invoices</p>
            <p className={`font-semibold ${outstandingInvoices > 0 ? "text-amber-600" : "text-ink"}`}>
              {outstandingInvoices}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Invoices Sent</p>
            <p className="text-ink font-semibold">{invoicesSent}</p>
          </div>
        </div>
      </SectionCard>

      {/* Project state restrictions */}
      <SectionCard title="Project State Restrictions">
        <AllowedStatesForm
          companyId={id}
          current={(company.allowed_states ?? null) as string[] | null}
        />
      </SectionCard>

      {/* Users — flat PM list */}
      <SectionCard title="Project Managers">
        {pms.length === 0 ? (
          <p className="text-sm text-muted py-2">No Project Managers yet.</p>
        ) : (
          <div className="divide-y divide-surface -mx-6 -mt-2 mb-6">
            {pms.map((pm) => (
              <div key={pm.membershipId} className="flex items-center justify-between gap-4 px-6 py-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {pm.displayName ?? <span className="text-muted italic">Unknown</span>}
                  </p>
                  <span className="text-[10px] font-medium bg-wash text-muted rounded px-1.5 py-0.5 flex-shrink-0">PM</span>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Link
                    href={`/admin/users/${pm.userId}${returnToParam}`}
                    title="View user"
                    className="p-1 rounded text-faint hover:text-primary hover:bg-primary-soft transition-colors"
                  >
                    <EyeIcon />
                  </Link>
                  <Link
                    href={`/admin/users/${pm.userId}/edit${returnToParam}`}
                    title="Edit user"
                    className="p-1 rounded text-faint hover:text-primary hover:bg-primary-soft transition-colors"
                  >
                    <PencilIcon />
                  </Link>
                  <RemoveCompanyMemberButton
                    membershipId={pm.membershipId}
                    companyId={id}
                    displayName={pm.displayName ?? "this user"}
                    asIcon
                  />
                </div>
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
            <Link href={`/admin/projects?company=${id}`} className="text-xs text-primary hover:underline">
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
                  <ProjectStatusBadge status={p.unified_status} />
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
