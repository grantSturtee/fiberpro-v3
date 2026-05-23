import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { UploadTCPForm } from "@/components/designer/UploadTCPForm";
import { SubmitForReviewForm } from "@/components/designer/SubmitForReviewForm";
import { DesignerTcpSheetList } from "@/components/designer/DesignerTcpSheetList";
import { DesignerProjectRail } from "@/components/designer/DesignerProjectRail";
import { CoverMapCard } from "@/components/admin/CoverMapCard";
import { parseAnnotations } from "@/types/coverMapAnnotations";
import { ActivityComposer, ActivityFeedList } from "@/components/shared/UnifiedActivityFeed";
import { type NoteEntry } from "@/components/admin/AdminNotesRail";
import { ProjectWorkspaceTabs } from "@/components/admin/ProjectWorkspaceTabs";
import { resolveActiveTab, type WorkspaceTab } from "@/lib/workspace/tabConfig";
import { canViewSection, canEditSection } from "@/lib/workspace/sectionAccess";
import { createClient } from "@/lib/supabase/server";
import { getDesignerProjectDetail } from "@/lib/queries/projects";
import {
  getDesignerPackageCompositionFacts,
  type PackageCompositionFacts,
} from "@/lib/queries/packageComposition";
import { getJurisdiction, type JurisdictionSummary } from "@/lib/queries/jurisdictions";
import { formatDate, formatDateTime, humanize } from "@/lib/utils/format";
import { getUpdateCadenceDays } from "@/lib/queries/appSettings";
import { ACTIVE_STATUSES, isUpdateStale } from "@/lib/utils/projectUpdateStatus";

export const metadata: Metadata = { title: "Project" };

// Required documents shown in the read-only authority context card
const REQUIRED_DOC_FLAGS: { key: keyof JurisdictionSummary; label: string }[] = [
  { key: "requires_coi",                  label: "COI" },
  { key: "requires_pe_stamp",             label: "PE Stamp" },
  { key: "requires_traffic_control_plan", label: "TCP" },
  { key: "requires_cover_sheet",          label: "Cover Sheet" },
  { key: "requires_application_form",     label: "Application Form" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DesignerProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const designerId = userData.user.id;
  const currentUserRole = (userData.user.app_metadata as { role?: string })?.role ?? "designer";

  // Returns null if the project doesn't exist or isn't assigned to this designer.
  // Access control lives in the query (assigned_designer_id filter), not as a
  // post-query guard — this avoids false-404 regressions from admin-scoped functions.
  const project = await getDesignerProjectDetail(supabase, id, designerId);

  if (!project) notFound();

  // ── Parallel data fetches ─────────────────────────────────────────────────

  const [
    { data: sldData },
    { data: tcpData },
    { data: intakeData },
    { data: tcdData },
    { data: updatesData },
    { data: notesData },
    { data: activityData },
    updateStaleDays,
    jurisdiction,
    { data: latestCompletedPackageJobData },
    { data: lastSeenData },
  ] = await Promise.all([
    // SLD files (read-only reference)
    supabase
      .from("project_files")
      .select("id, file_name, created_at, storage_path")
      .eq("project_id", id)
      .eq("file_category", "sld_sheet")
      .order("created_at", { ascending: true }),

    // TCP files uploaded by this designer — manual sort_order (Phase A) wins,
    // with created_at ASC as tiebreaker so legacy rows (sort_order = NULL)
    // continue to render in upload order.
    supabase
      .from("project_files")
      .select("id, file_name, created_at, storage_path, file_size_bytes")
      .eq("project_id", id)
      .eq("file_category", "tcp_pdf")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),

    // Client intake files (read-only reference)
    supabase
      .from("project_files")
      .select("id, file_name, created_at, storage_path")
      .eq("project_id", id)
      .eq("file_type", "intake")
      .order("created_at", { ascending: true }),

    // TCD selections (admin-selected, designer reads as reference)
    supabase
      .from("project_tcd_selections")
      .select("id, tcd_library ( code, description, storage_path )")
      .eq("project_id", id)
      .order("sort_order", { ascending: true }),

    // Internal status updates
    supabase
      .from("project_updates")
      .select("id, body, status, created_by, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),

    // Notes (internal conversation feed — for right rail)
    supabase
      .from("project_messages")
      .select("id, sender_id, sender_label, sender_role, body, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),

    // Activity log — displayed in Activity tab + passed to rail
    supabase
      .from("project_activity")
      .select("id, actor_label, action, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(50),

    // Configured update cadence
    getUpdateCadenceDays(supabase),

    // Jurisdiction — used for read-only authority context on Setup tab
    project.jurisdiction_id ? getJurisdiction(supabase, project.jurisdiction_id) : null,

    // Latest completed package job — used to show package status on Package tab
    supabase
      .from("workflow_jobs")
      .select("id, status, created_at")
      .eq("project_id", id)
      .eq("job_type", "generate_permit_package")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Last-seen timestamp for this user — used to compute unread message count
    supabase
      .from("conversation_last_seen")
      .select("last_seen_at")
      .eq("project_id", id)
      .eq("user_id", designerId)
      .maybeSingle(),
  ]);

  // Mark conversation as seen on page open (upsert last_seen_at)
  await supabase
    .from("conversation_last_seen")
    .upsert({ project_id: id, user_id: designerId, last_seen_at: new Date().toISOString() },
      { onConflict: "project_id,user_id" });

  // ── Phase J — Cover map fetch (for the Design-tab card) ─────────────────────
  // Defensive: if the project_cover_maps row, columns, or signed-URL call fail,
  // each variable stays null and the empty-state UI renders.
  let coverMapPath:        string | null = null;
  let coverMapCroppedPath: string | null = null;
  let coverMapRasterPath:  string | null = null;
  let coverMapFileName:    string | null = null;
  let coverMapMimeType:    string | null = null;
  let coverMapSignedUrl:         string | null = null;
  let coverMapCroppedSignedUrl:  string | null = null;
  let coverMapRasterSignedUrl:   string | null = null;
  let coverMapRasterWidth:  number | null = null;
  let coverMapRasterHeight: number | null = null;
  let coverMapCropTransform: unknown = null;
  let coverMapAnnotationsRaw:   unknown        = null;
  try {
    const { data: coverRow, error: coverErr } = await supabase
      .from("project_cover_maps")
      .select("storage_path, cropped_storage_path, raster_storage_path, raster_width, raster_height, crop_transform, file_name, mime_type, annotations")
      .eq("project_id", id)
      .maybeSingle();
    if (coverErr) {
      console.warn("[designer/projects/[id]] cover map lookup failed:", coverErr.message);
    } else if (coverRow) {
      const r = coverRow as Record<string, unknown>;
      coverMapPath           = r.storage_path         as string;
      coverMapCroppedPath    = (r.cropped_storage_path as string | null) ?? null;
      coverMapRasterPath     = (r.raster_storage_path  as string | null) ?? null;
      coverMapRasterWidth    = (r.raster_width         as number | null) ?? null;
      coverMapRasterHeight   = (r.raster_height        as number | null) ?? null;
      coverMapCropTransform  = r.crop_transform ?? null;
      coverMapFileName       = (r.file_name            as string | null) ?? null;
      coverMapMimeType       = (r.mime_type            as string | null) ?? null;
      coverMapAnnotationsRaw = r.annotations ?? null;
    }
  } catch (e) {
    console.warn("[designer/projects/[id]] cover map lookup threw:", e);
  }
  if (coverMapPath) {
    try {
      const { data: signed } = await supabase.storage
        .from("project-files")
        .createSignedUrl(coverMapPath, 60 * 60);
      coverMapSignedUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.warn("[designer/projects/[id]] cover map sign URL threw:", e);
    }
  }
  if (coverMapCroppedPath) {
    try {
      const { data: signed } = await supabase.storage
        .from("project-files")
        .createSignedUrl(coverMapCroppedPath, 60 * 60);
      coverMapCroppedSignedUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.warn("[designer/projects/[id]] cover map cropped sign URL threw:", e);
    }
  }
  // Phase 2 — sign the raster so the crop editor can render it client-side.
  if (coverMapRasterPath) {
    try {
      const { data: signed } = await supabase.storage
        .from("project-files")
        .createSignedUrl(coverMapRasterPath, 60 * 60);
      coverMapRasterSignedUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.warn("[designer/projects/[id]] cover map raster sign URL threw:", e);
    }
  }
  const coverMapAnnotations = coverMapAnnotationsRaw
    ? parseAnnotations(coverMapAnnotationsRaw)
    : null;

  const sldFiles = (sldData ?? []) as {
    id: string; file_name: string; created_at: string; storage_path: string;
  }[];

  const tcpFiles = (tcpData ?? []) as {
    id: string; file_name: string; created_at: string; storage_path: string; file_size_bytes: number | null;
  }[];

  const intakeFiles = (intakeData ?? []) as {
    id: string; file_name: string; created_at: string; storage_path: string;
  }[];

  const selectedTCDs = (tcdData ?? []).map((row: Record<string, unknown>) => {
    const lib = row.tcd_library as { code: string; description: string; storage_path: string | null } | null;
    return {
      id: row.id as string,
      code: lib?.code ?? "—",
      description: lib?.description ?? "",
      storage_path: lib?.storage_path ?? null,
    };
  });

  const projectUpdates = (updatesData ?? []) as {
    id: string; body: string | null; status: string | null; created_by: string; created_at: string;
  }[];

  const notes = (notesData ?? []) as NoteEntry[];

  const activity = (activityData ?? []) as {
    id: string; actor_label: string | null; action: string; created_at: string;
  }[];

  // ── Unread message count ──────────────────────────────────────────────────
  // Count messages from other senders created after the previous last_seen_at.
  // Uses the PREVIOUS value fetched before the upsert above.
  const prevLastSeen = (lastSeenData as { last_seen_at: string } | null)?.last_seen_at ?? null;
  const unreadCount = prevLastSeen
    ? notes.filter(
        (n) => n.sender_id !== designerId && new Date(n.created_at) > new Date(prevLastSeen)
      ).length
    : notes.filter((n) => n.sender_id !== designerId).length;

  // ── Revision notes — most recent revisions_required update body ───────────
  const latestRevisionUpdate = projectUpdates.find((u) => u.status === "revisions_required");
  const revisionNotes = latestRevisionUpdate?.body ?? null;

  // ── Stale update tracking ─────────────────────────────────────────────────

  const lastUpdateAt = projectUpdates[0]?.created_at ?? null;
  const daysSinceLastUpdate = lastUpdateAt
    ? Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 86_400_000)
    : null;
  const projectIsActive = (ACTIVE_STATUSES as readonly string[]).includes(project.status);
  const updateIsStale = projectIsActive && isUpdateStale(lastUpdateAt, updateStaleDays);

  // ── Signed storage URLs — generate in parallel ────────────────────────────

  const [sldUrlPairs, tcpUrlPairs, intakeUrlPairs, tcdUrlPairs] = await Promise.all([
    Promise.all(
      sldFiles.map(async (f) => {
        const { data } = await supabase.storage
          .from("project-files")
          .createSignedUrl(f.storage_path, 3600);
        return [f.id, data?.signedUrl ?? null] as const;
      })
    ),
    Promise.all(
      tcpFiles.map(async (f) => {
        const { data } = await supabase.storage
          .from("project-files")
          .createSignedUrl(f.storage_path, 3600);
        return [f.id, data?.signedUrl ?? null] as const;
      })
    ),
    Promise.all(
      intakeFiles.map(async (f) => {
        const { data } = await supabase.storage
          .from("project-files")
          .createSignedUrl(f.storage_path, 3600);
        return [f.id, data?.signedUrl ?? null] as const;
      })
    ),
    Promise.all(
      selectedTCDs
        .filter((t) => t.storage_path)
        .map(async (t) => {
          const { data } = await supabase.storage
            .from("tcd-pdfs")
            .createSignedUrl(t.storage_path!, 3600);
          return [t.id, data?.signedUrl ?? null] as const;
        })
    ),
  ]);

  const isPresent = (p: readonly [string, string | null]): p is readonly [string, string] => p[1] !== null;
  const sldUrls: Record<string, string> = Object.fromEntries(sldUrlPairs.filter(isPresent));
  const tcpUrls: Record<string, string> = Object.fromEntries(tcpUrlPairs.filter(isPresent));
  const intakeUrls: Record<string, string> = Object.fromEntries(intakeUrlPairs.filter(isPresent));
  const tcdUrls: Record<string, string> = Object.fromEntries(tcdUrlPairs.filter(isPresent));

  // ── Derived display values ────────────────────────────────────────────────

  const authorityDisplay = (() => {
    if (project.authority_type === "njdot") return "NJDOT";
    if (project.county) return `${project.county} County`;
    if (project.city) return project.city;
    return humanize(project.authority_type);
  })();

  // Status-gated design actions (project must be in an active design state)
  const canDesign = ["assigned", "in_design", "revisions_required"].includes(project.status);

  const canUploadTCP = canDesign && canEditSection(currentUserRole, "tcp_sheets");
  const canSubmitReview = canDesign && canEditSection(currentUserRole, "tcp_submit");
  const canPostUpdate = projectIsActive && canEditSection(currentUserRole, "status_updates");

  const hasTCPFiles = tcpFiles.length > 0;
  const hasCompletedPackage = !!latestCompletedPackageJobData;

  // Package composition facts — same source of truth as the admin Package tab.
  // The helper resolves blueprint/authority/template state via a service-role
  // client internally (designers are RLS-blocked from those tables) and
  // returns ONLY denormalized booleans + display strings.
  let packageFacts: PackageCompositionFacts | null = null;
  try {
    packageFacts = await getDesignerPackageCompositionFacts(supabase, {
      project: {
        id: project.id,
        status: project.status,
        blueprint_id:                project.blueprint_id,
        authority_id:                project.authority_id,
        jurisdiction_id:             project.jurisdiction_id,
        pe_required:                 project.pe_required,
        req_application_override:    project.req_application_override,
        req_certification_override:  project.req_certification_override,
        req_coi_override:            project.req_coi_override,
      },
      tcpFiles: tcpFiles.map((f) => ({ id: f.id, file_name: f.file_name })),
      tcdSelections: selectedTCDs.map((t) => ({ tcdItemId: t.id, code: t.code })),
      sldFiles: sldFiles.map((f) => ({ id: f.id, file_name: f.file_name })),
    });
  } catch (e) {
    console.warn("[designer/projects/[id]] package composition facts threw:", e);
  }

  const revalidatePath = `/designer/projects/${id}`;

  // Required docs for authority context card
  const requiredDocs = jurisdiction
    ? REQUIRED_DOC_FLAGS.filter((f) => jurisdiction[f.key] === true)
    : [];

  // ── Active tab resolution ─────────────────────────────────────────────────

  const { tab } = await searchParams;
  const activeTab: WorkspaceTab = resolveActiveTab(tab, currentUserRole, project.status);

  // ── Rail file nav items ───────────────────────────────────────────────────

  const fileNavItems = [
    { label: "Intake Files", count: intakeFiles.length, targetId: "section-intake" },
    ...(selectedTCDs.length > 0 ? [
      { label: "TCD Sheets", count: selectedTCDs.length, targetId: "section-tcd" },
    ] : []),
    { label: "SLD Sheets", count: sldFiles.length,  targetId: "section-sld" },
    { label: "TCP Sheets", count: tcpFiles.length, targetId: "section-tcp" },
  ];

  // ── View icon SVG (reused for file rows) ─────────────────────────────────

  const ViewIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">

      {/* ── Sticky project header ── */}
      <div
        className="flex-shrink-0 bg-card px-8 py-4 flex items-center gap-4"
        style={{ boxShadow: "0 1px 0 rgba(43,52,55,0.08)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <Link href="/designer" className="text-xs text-muted hover:text-dim transition-colors">
              My Work
            </Link>
            <span className="text-xs text-faint">/</span>
            <span className="text-xs text-muted font-mono">{project.job_number}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-base font-semibold text-ink">{project.job_name}</h1>
            <ProjectStatusBadge status={project.unified_status} />
            {project.status === "revisions_required" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                Action Required
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {project.company_name ?? "—"} · {authorityDisplay}
            {project.requested_approval_date
              ? ` · Due ${formatDate(project.requested_approval_date)}`
              : ""}
          </p>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <ProjectWorkspaceTabs
        projectId={id}
        activeTab={activeTab}
        currentUserRole={currentUserRole}
        basePath="/designer/projects"
      />

      {/* ── Stale update banner — always visible when overdue ── */}
      {updateIsStale && projectIsActive && (
        <div
          className="flex-shrink-0 flex items-center justify-between gap-3 px-8 py-2.5"
          style={{ background: "#fffbeb", borderBottom: "1px solid #fcd34d" }}
        >
          <div className="flex items-center gap-2.5">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0">
              <path d="M8 2L14 13H2L8 2z" />
              <line x1="8" y1="7" x2="8" y2="10" />
              <circle cx="8" cy="12" r="0.5" fill="#d97706" />
            </svg>
            <p className="text-sm font-medium text-amber-800">
              {lastUpdateAt === null
                ? "No status update posted yet."
                : `Status update overdue — last posted ${daysSinceLastUpdate}d ago.`}
            </p>
          </div>
          <Link
            href={`/designer/projects/${id}?tab=activity`}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors flex-shrink-0"
          >
            Post status update →
          </Link>
        </div>
      )}

      {/* ── Two-column body ── */}
      <div className="flex-1 flex min-h-0">
        <div className="flex gap-0 min-h-0 flex-1">

          {/* ── Left: main sections ── */}
          <div
            id="project-main-scroll"
            className={
              activeTab === "activity"
                ? "flex-1 min-w-0 flex flex-col overflow-hidden bg-white"
                : "flex-1 min-w-0 overflow-y-auto overscroll-y-contain p-8 space-y-6 bg-white"
            }
          >

            {/* ── Intake tab ── */}
            {activeTab === "intake" && (
            <>

            {/* 1. Project Details — read-only intake summary */}
            {canViewSection(currentUserRole, "project_details") && (
            <SectionCard flat
              id="section-details"
              title="Project Details"
              description="Submitted with the intake request. Contact admin if anything looks incorrect."
            >
              {(() => {
                // Phase A — show structured street_address + city/state/zip
                // when present; fall back to legacy job_address otherwise.
                const cityStateZip = (() => {
                  const left  = project.city?.trim() || null;
                  const right = [project.state?.trim(), project.zip_code?.trim()].filter(Boolean).join(" ") || null;
                  if (left && right) return `${left}, ${right}`;
                  return left || right;
                })();
                const addressBlock = project.street_address ? (
                  <>
                    <p className="text-sm text-ink">{project.street_address}</p>
                    {cityStateZip && <p className="text-sm text-ink">{cityStateZip}</p>}
                  </>
                ) : (
                  <p className="text-sm text-ink">{project.job_address || <span className="text-faint">—</span>}</p>
                );
                return (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <div className="col-span-2">
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Address</p>
                      {addressBlock}
                    </div>
                    {[
                      { label: "Type of Plan",        value: humanize(project.type_of_plan) },
                      { label: "Authority",           value: authorityDisplay },
                      { label: "State",               value: project.state },
                      { label: "County",              value: project.county },
                      { label: "City / Municipality", value: project.city },
                      {
                        label: "Mileposts",
                        value: (() => {
                          const s = project.milepost_start;
                          const e = project.milepost_end;
                          if (s && e) return `${s} – ${e}`;
                          if (s) return `${s} –`;
                          if (e) return `– ${e}`;
                          return null;
                        })(),
                      },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-sm text-ink">{value || <span className="text-faint">—</span>}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {project.notes && (
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
                    Admin Notes
                  </p>
                  <p className="text-sm text-ink">{project.notes}</p>
                </div>
              )}
            </SectionCard>
            )}

            {/* 2. Client Intake Files — read-only */}
            {canViewSection(currentUserRole, "intake_files") && (
            <SectionCard flat
              id="section-intake"
              title="Client Intake Files"
              description="Files submitted by the client with this request."
            >
              {intakeFiles.length === 0 ? (
                <p className="text-sm text-muted">No client intake files on record.</p>
              ) : (
                <div className="divide-y divide-surface">
                  {intakeFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-red-600">PDF</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{f.file_name}</p>
                          <p className="text-xs text-muted">{formatDate(f.created_at)}</p>
                        </div>
                      </div>
                      {intakeUrls[f.id] ? (
                        <a
                          href={intakeUrls[f.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`View ${f.file_name}`}
                          aria-label={`View ${f.file_name}`}
                          className="p-1.5 rounded text-muted hover:text-primary transition-colors flex-shrink-0"
                        >
                          <ViewIcon />
                        </a>
                      ) : (
                        <span className="p-1.5 text-faint flex-shrink-0"><ViewIcon /></span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            )}

            </>
            )}

            {/* ── Setup tab ── */}
            {activeTab === "setup" && (
            <>

            {/* 1. Authority & Requirements — permitting context set by admin */}
            {canViewSection(currentUserRole, "authority_context") && (
            <SectionCard flat
              id="section-authority"
              title="Authority & Requirements"
              description="Permitting authority and submission requirements configured by admin. Use this as the governing context for your design work."
            >
              {jurisdiction ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Authority</p>
                      <p className="text-sm text-ink">{jurisdiction.authority_name}</p>
                    </div>
                    {jurisdiction.submission_method && (
                      <div>
                        <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Submission</p>
                        <p className="text-sm text-ink">{humanize(jurisdiction.submission_method)}</p>
                      </div>
                    )}
                    {jurisdiction.avg_approval_days && (
                      <div>
                        <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Avg. Approval</p>
                        <p className="text-sm text-ink">~{jurisdiction.avg_approval_days} days</p>
                      </div>
                    )}
                  </div>
                  {requiredDocs.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1.5">Required Documents</p>
                      <div className="flex flex-wrap gap-1.5">
                        {requiredDocs.map((f) => (
                          <span
                            key={f.key}
                            className="text-[10px] font-medium bg-primary-soft text-primary rounded px-1.5 py-0.5"
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {jurisdiction.notes && (
                    <div className="pt-3" style={{ borderTop: "1px solid #e3e9ec" }}>
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">Authority Notes</p>
                      <p className="text-sm text-ink">{jurisdiction.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No matching jurisdiction found for this project. Contact admin for permitting requirements.
                </p>
              )}
            </SectionCard>
            )}

            {/* 2. TCD reference — admin-curated device set for this project */}
            {canViewSection(currentUserRole, "tcd_reference") && selectedTCDs.length > 0 && (
              <SectionCard flat
                id="section-tcd"
                title="Selected TCD Sheets"
                description="Admin-curated for this project. Use these devices as the basis for your TCP design."
              >
                <div className="space-y-2">
                  {selectedTCDs.map((tcd) => (
                    <div
                      key={tcd.id}
                      className="flex items-center gap-4 bg-surface rounded-lg px-4 py-3"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-ink">{tcd.code}</p>
                        <p className="text-xs text-muted">{tcd.description}</p>
                      </div>
                      {tcdUrls[tcd.id] ? (
                        <a
                          href={tcdUrls[tcd.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`View ${tcd.code}`}
                          aria-label={`View ${tcd.code}`}
                          className="p-1.5 rounded text-muted hover:text-primary transition-colors flex-shrink-0"
                        >
                          <ViewIcon />
                        </a>
                      ) : (
                        <span className="p-1.5 text-faint flex-shrink-0"><ViewIcon /></span>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            </>
            )}

            {/* ── Design tab ── */}
            {activeTab === "design" && (
            <>

            {/* Revisions notice — prominent banner, shows admin message if provided */}
            {project.status === "revisions_required" && (
              <div
                className="rounded-xl px-5 py-4"
                style={{ background: "#fef2f2", border: "1.5px solid #fca5a5" }}
              >
                <div className="flex items-start gap-3">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5" aria-hidden>
                    <circle cx="8" cy="8" r="6" />
                    <line x1="8" y1="5" x2="8" y2="8.5" />
                    <circle cx="8" cy="11" r="0.5" fill="#dc2626" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-red-800">Revisions requested by admin</p>
                    {revisionNotes ? (
                      <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{revisionNotes}</p>
                    ) : (
                      <p className="text-xs text-red-600 mt-0.5">
                        Upload revised TCP sheets and resubmit for review.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Submitted notice */}
            {project.status === "waiting_for_admin_review" && (
              <div className="flex items-start gap-3 bg-violet-50 rounded-xl px-5 py-4">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 flex-shrink-0" />
                <p className="text-sm text-violet-800">
                  TCP sheets submitted. Awaiting admin review.
                </p>
              </div>
            )}

            {/* Phase J — Cover map (designers can upload PDFs and edit work
                paths on assigned projects). Server actions verify the
                designer is assigned to the project before accepting writes. */}
            <SectionCard flat
              title="Cover Map"
              description="Upload a Google Maps PDF. The first page is auto-cropped and rendered into any page-template region bound to “Project Cover Map”."
            >
              <CoverMapCard
                projectId={project.id}
                currentMapUrl={coverMapSignedUrl}
                currentMapCroppedUrl={coverMapCroppedSignedUrl}
                currentMapRasterUrl={coverMapRasterSignedUrl}
                currentMapRasterWidth={coverMapRasterWidth}
                currentMapRasterHeight={coverMapRasterHeight}
                currentMapCropTransform={coverMapCropTransform}
                currentMapFileName={coverMapFileName}
                currentMapMimeType={coverMapMimeType}
                currentAnnotations={coverMapAnnotations}
              />
            </SectionCard>

            {/* 5. SLD Sheets — read-only design reference */}
            {canViewSection(currentUserRole, "sld_sheets") && (
            <SectionCard flat id="section-sld" title="SLD Sheets">
              {sldFiles.length === 0 ? (
                <EmptyState
                  title="No SLD sheets yet"
                  description="Admin has not uploaded SLD sheets. Reach out for clarification before starting design."
                />
              ) : (
                <div className="divide-y divide-surface">
                  {sldFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-red-600">PDF</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{f.file_name}</p>
                          <p className="text-xs text-muted">{formatDate(f.created_at)}</p>
                        </div>
                      </div>
                      {sldUrls[f.id] ? (
                        <a
                          href={sldUrls[f.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`View ${f.file_name}`}
                          aria-label={`View ${f.file_name}`}
                          className="p-1.5 rounded text-muted hover:text-primary transition-colors flex-shrink-0"
                        >
                          <ViewIcon />
                        </a>
                      ) : (
                        <span className="p-1.5 text-faint flex-shrink-0"><ViewIcon /></span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            )}

            {/* 6. TCP Sheets — designer's primary deliverable */}
            {canViewSection(currentUserRole, "tcp_sheets") && (
            <SectionCard flat
              id="section-tcp"
              title="TCP Sheets"
              action={canUploadTCP ? <UploadTCPForm projectId={project.id} /> : undefined}
            >
              {tcpFiles.length === 0 ? (
                <EmptyState
                  title="No TCP sheets uploaded yet"
                  description={
                    canUploadTCP
                      ? "Upload your Traffic Control Plan PDF sheets. You can upload multiple sheets."
                      : "No TCP sheets uploaded for this project."
                  }
                />
              ) : (
                <DesignerTcpSheetList
                  projectId={project.id}
                  canReorder={canUploadTCP}
                  canDelete={canUploadTCP}
                  files={tcpFiles.map((f) => ({
                    id: f.id,
                    file_name: f.file_name,
                    created_at: f.created_at,
                    signedUrl: tcpUrls[f.id] ?? null,
                  }))}
                />
              )}
            </SectionCard>
            )}

            {/* Submit / Resubmit for review */}
            {canSubmitReview && (
              <SubmitForReviewForm
                projectId={project.id}
                hasTCPFiles={hasTCPFiles}
                isRevision={project.status === "revisions_required"}
              />
            )}

            </>
            )}

            {/* ── Package tab — read-only composition view ── */}
            {activeTab === "package" && canViewSection(currentUserRole, "package_composition") && (
            <>

            <SectionCard flat
              title="Package Composition"
              description="What will be assembled into the permit package. Configure in Setup; generated by admin."
            >
              <div className="space-y-5">

                {/* Active template — read-only mirror of admin (no Change link) */}
                {packageFacts?.activeTemplate && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Active Template</p>
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {packageFacts.activeTemplate.description ?? "(no description)"}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {packageFacts.activeTemplate.isAuthorityDefault ? "Authority default" : "Admin override"}
                        {packageFacts.activeTemplate.workType ? ` · ${packageFacts.activeTemplate.workType}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {/* Assembly layers — driven by shared package composition facts */}
                <div className={packageFacts?.activeTemplate ? "pt-4 space-y-3" : "space-y-3"}
                     style={packageFacts?.activeTemplate ? { borderTop: "1px solid #e3e9ec" } : undefined}>
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
                    Assembly Order — Main Package
                  </p>

                  {(packageFacts
                    ? [packageFacts.coverRow, packageFacts.tcpRow, packageFacts.tcdRow, packageFacts.sldRow]
                    : []
                  ).map((row) => (
                    <div key={row.label} className="flex items-start gap-3">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: row.met ? "#dcfce7" : "#f3f4f6" }}
                      >
                        {row.met ? (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                            <path d="M2 5l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-gray-300 block" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-medium text-ink">{row.label}</p>
                          <span className={`text-xs flex-shrink-0 ${row.met ? "text-emerald-700" : "text-muted"}`}>
                            {row.detail}
                          </span>
                        </div>
                        {row.label === "TCD Sheets" && selectedTCDs.length > 0 && (
                          <p className="text-[11px] text-muted mt-0.5">
                            {selectedTCDs.slice(0, 4).map((t) => t.code).join(" · ")}
                            {selectedTCDs.length > 4 ? ` · +${selectedTCDs.length - 4} more` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Readiness summary — same prereq facts as admin (read-only) */}
                {packageFacts && (
                  <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-4">
                    {packageFacts.isReady ? (
                      <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <circle cx="6" cy="6" r="5" fill="#dcfce7" />
                            <path d="M3 6l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Ready to generate
                        </span>
                        <p className="text-xs text-muted pl-0.5">
                          {packageFacts.totalPages} page{packageFacts.totalPages !== 1 ? "s" : ""} total
                          {" · "}1 cover
                          {packageFacts.sectionCounts.tcp > 0 ? ` · ${packageFacts.sectionCounts.tcp} TCP` : ""}
                          {packageFacts.sectionCounts.tcd > 0 ? ` · ${packageFacts.sectionCounts.tcd} TCD` : ""}
                          {packageFacts.sectionCounts.sld > 0 ? ` · ${packageFacts.sectionCounts.sld} SLD` : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <circle cx="6" cy="6" r="5" stroke="#d97706" strokeWidth="1.2" />
                            <path d="M6 3.5v3" stroke="#d97706" strokeWidth="1.2" strokeLinecap="round" />
                            <circle cx="6" cy="8.5" r=".6" fill="#d97706" />
                          </svg>
                          Not ready — {packageFacts.missingItems.length} item{packageFacts.missingItems.length !== 1 ? "s" : ""} needed
                        </span>
                        <p className="text-xs text-muted pl-0.5">
                          Missing: {packageFacts.missingItems.join(", ")}
                          {packageFacts.totalPages > 1 && (
                            <span className="ml-2 text-faint">
                              ({packageFacts.totalPages} page{packageFacts.totalPages !== 1 ? "s" : ""} so far)
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Package generation status — designer is read-only and cannot trigger */}
                <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-4">
                  {hasCompletedPackage ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <circle cx="6" cy="6" r="5" fill="#dcfce7" />
                          <path d="M3 6l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Package generated
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      Package not yet generated. Admin will generate once design is approved.
                    </p>
                  )}
                </div>

              </div>
            </SectionCard>

            </>
            )}

            {/* ── Activity tab ── */}
            {activeTab === "activity" && (
            <>

            {/* Pinned composer */}
            <div
              className="flex-shrink-0 px-8 pt-6 pb-5"
              style={{ borderBottom: "1px solid #e3e9ec" }}
            >
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Project Activity</h2>
                  <p className="mt-0.5 text-xs text-muted">Internal status updates and workflow events.</p>
                </div>
                {lastUpdateAt && (
                  <span className="text-[11px] text-muted flex-shrink-0">
                    Updated{" "}
                    {daysSinceLastUpdate === 0
                      ? "today"
                      : daysSinceLastUpdate === 1
                      ? "yesterday"
                      : `${daysSinceLastUpdate}d ago`}
                  </span>
                )}
              </div>
              {canPostUpdate && (
                <ActivityComposer
                  projectId={project.id}
                  revalidatePath={revalidatePath}
                  stale={updateIsStale}
                  staleDayCount={daysSinceLastUpdate}
                />
              )}
            </div>

            {/* Scrollable feed */}
            <div className="flex-1 min-h-0 overflow-y-auto px-8 py-4">
              <ActivityFeedList
                projectUpdates={projectUpdates}
                activity={activity}
              />
            </div>

            </>
            )}

          </div>

          {/* ── Right: project rail ── */}
          <DesignerProjectRail
            fileNavItems={fileNavItems}
            activity={activity}
            projectId={id}
            notes={notes}
            revalidatePath={revalidatePath}
            currentUserId={designerId}
            currentUserRole={currentUserRole}
            unreadCount={unreadCount}
          />

        </div>
      </div>
    </div>
  );
}
