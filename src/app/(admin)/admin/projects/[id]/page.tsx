import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Eye } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { UploadSLDForm, DeleteSLDButton } from "@/components/admin/UploadSLDForm";
import { AssignDesignerForm } from "@/components/admin/AssignDesignerForm";
import { ApproveDesignForm, RequestRevisionsForm, DesignReviewPanel } from "@/components/admin/WorkflowActionForms";
import { TcdLibraryModal, type TcdLibraryItem } from "@/components/admin/TcdLibraryModal";
import { RemoveTCDButton } from "@/components/admin/RemoveTCDButton";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getProjectDetail, getDesigners } from "@/lib/queries/projects";
import { getJurisdiction, type JurisdictionSummary } from "@/lib/queries/jurisdictions";
import { RecomputeProjectButton } from "@/components/admin/RecomputeProjectButton";
import { GeneratePackageButton } from "@/components/admin/GeneratePackageButton";
import { PackageJobPoller } from "@/components/admin/PackageJobPoller";
import { type NoteEntry } from "@/components/admin/AdminNotesRail";
import { ProjectRail } from "@/components/admin/ProjectRail";
import { EditIntakeForm } from "@/components/admin/EditIntakeForm";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { getLatestJob } from "@/lib/workflow/enqueue";
import { JOB_STATUS_LABEL, JOB_STATUS_COLOR, type WorkflowJobStatus } from "@/types/workflow";
import { formatDate, formatDateTime, humanize } from "@/lib/utils/format";
import { CLIENT_FILE_CATEGORIES, FILE_CATEGORIES, FILE_CATEGORY_LABELS, GENERATED_FILE_CATEGORIES, isBrowserViewable } from "@/lib/constants/files";
import { FileDownloadLink } from "@/components/ui/FileDownloadLink";
import { FileTypeBadge } from "@/components/ui/FileTypeBadge";
import { AuthoritySelector, type AuthorityProfileOption } from "@/components/admin/AuthoritySelector";
import { ManualPackageUpload } from "@/components/admin/ManualPackageUpload";
import { SeparateOutputRow, type SeparateOutputFile } from "@/components/admin/SeparateOutputRow";
import { type AuthorityProfile, type ChecklistItem } from "@/components/admin/AuthorityRequirementsPanel";
import { UploadTCPAdminForm } from "@/components/admin/UploadTCPAdminForm";
import { TcpSheetList } from "@/components/shared/TcpSheetList";
import { CoverMapCard } from "@/components/admin/CoverMapCard";
import { parseAnnotations } from "@/types/coverMapAnnotations";
import { RequirementOverridesForm } from "@/components/admin/RequirementOverridesForm";
import { BlueprintSelector, type BlueprintOption } from "@/components/admin/BlueprintSelector";
import {
  getBlueprintMissingRequired,
  getBlueprintMissingAuthorityDocs,
} from "@/app/(admin)/admin/settings/package-templates/blueprintCompleteness";
import { resolveRequirements, type AuthorityRequirementDefaults, type ProjectRequirementOverrides } from "@/lib/utils/resolveRequirements";
import { SubmissionTrackingPanel } from "@/components/admin/SubmissionTrackingPanel";
import { ProjectWorkspaceTabs } from "@/components/admin/ProjectWorkspaceTabs";
import { resolveActiveTab, type WorkspaceTab } from "@/lib/workspace/tabConfig";
import {
  markReadyForSubmission,
  recordSubmission,
  markWaitingOnAuthority,
  markAuthorityActionNeeded,
  markPermitReceived,
  saveSubmissionFields,
} from "@/app/(admin)/admin/projects/[id]/submission-actions";
import { BillingPanel } from "@/components/admin/BillingPanel";
import { ActivityComposer, ActivityFeedList } from "@/components/shared/UnifiedActivityFeed";
import {
  createInvoiceFromProject,
  updateDraftInvoice,
  addInvoiceLineItem,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
  sendInvoice,
  markInvoicePartiallyPaid,
  markInvoicePaid,
  voidInvoice,
  deleteDraftInvoice,
} from "@/app/(admin)/admin/invoices/actions";
import { getProjectInvoices } from "@/lib/queries/invoices";
import { resolvePricing } from "@/lib/pricing/resolve";
import { getUpdateCadenceDays } from "@/lib/queries/appSettings";
import { buildPageManifest, formatPageRange } from "@/lib/utils/packageAssembly";

export const metadata: Metadata = { title: "Project" };

const JOB_TYPE_LABELS_INLINE: Record<string, string> = {
  project_computed:          "Project Computed",
  generate_permit_package:   "Generate Package",
  generate_cover_sheet:      "Generate Cover Sheet",
  generate_application_form: "Generate Application",
  generate_tcp_package:      "Generate TCP Package",
  submit_permit:             "Submit Permit",
  generate_invoice:          "Generate Invoice",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldPair({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-[#111827]">{value || <span className="text-[#9CA3AF]">—</span>}</p>
    </div>
  );
}

// ── Project Intelligence section ──────────────────────────────────────────────

const REQUIRED_DOC_FLAGS: { key: keyof JurisdictionSummary; label: string }[] = [
  { key: "requires_coi",                    label: "COI" },
  { key: "requires_pe_stamp",               label: "PE Stamp" },
  { key: "requires_traffic_control_plan",   label: "TCP" },
  { key: "requires_cover_sheet",            label: "Cover Sheet" },
  { key: "requires_application_form",       label: "Application Form" },
];

function ProjectIntelligenceSection({
  projectId,
  jurisdiction,
  estimatedPrice,
  isStale,
}: {
  projectId: string;
  jurisdiction: JurisdictionSummary | null;
  estimatedPrice: number | null;
  isStale: boolean;
}) {
  const requiredDocs = jurisdiction
    ? REQUIRED_DOC_FLAGS.filter((f) => jurisdiction[f.key] === true)
    : [];

  return (
    <SectionCard flat
      title="Project Intelligence"
      description="Auto-computed from jurisdiction rules and pricing engine. Recalculate after editing project scope."
    >
      <div className="space-y-5">

        {/* Jurisdiction */}
        <div>
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Jurisdiction</p>
          {jurisdiction ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Authority</p>
                  <p className="text-sm text-[#111827]">{jurisdiction.authority_name}</p>
                </div>
                {jurisdiction.submission_method && (
                  <div>
                    <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Submission</p>
                    <p className="text-sm text-[#111827]">{humanize(jurisdiction.submission_method)}</p>
                  </div>
                )}
                {jurisdiction.avg_approval_days && (
                  <div>
                    <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Avg. Approval</p>
                    <p className="text-sm text-[#111827]">~{jurisdiction.avg_approval_days} days</p>
                  </div>
                )}
                {(jurisdiction.application_fee !== null || jurisdiction.jurisdiction_fee !== null) && (
                  <div>
                    <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Fees</p>
                    <p className="text-sm text-[#111827]">
                      {[
                        jurisdiction.application_fee !== null ? `App $${Number(jurisdiction.application_fee).toFixed(2)}` : null,
                        jurisdiction.jurisdiction_fee !== null ? `Jur $${Number(jurisdiction.jurisdiction_fee).toFixed(2)}` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}
              </div>

              {requiredDocs.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-1.5">Required Documents</p>
                  <div className="flex flex-wrap gap-1.5">
                    {requiredDocs.map((f) => (
                      <span
                        key={f.key}
                        className="text-[10px] font-medium bg-[#EFF6FF] text-[#1565C0] rounded px-1.5 py-0.5"
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-[#6B7280]">
                  {[jurisdiction.township, jurisdiction.county ? `${jurisdiction.county} Co.` : null, jurisdiction.state]
                    .filter(Boolean).join(", ")}
                </p>
                <Link
                  href={`/admin/settings/jurisdictions/${jurisdiction.id}/edit`}
                  className="text-xs text-[#1565C0] hover:underline"
                >
                  Edit →
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#6B7280]">No jurisdiction matched. Check state/county/city, then recalculate.</p>
          )}
        </div>

        {/* Estimated Price */}
        <div className="border-t border-[#E5E7EB] pt-5">
          <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Estimated Price</p>
          <p className="text-2xl font-semibold text-[#111827]">
            {estimatedPrice !== null
              ? `$${Number(estimatedPrice).toFixed(2)}`
              : <span className="text-base font-normal text-[#6B7280]">Not calculated</span>
            }
          </p>
          {estimatedPrice === null && (
            <p className="mt-1 text-xs text-[#6B7280]">
              Requires a matching jurisdiction and pricing rule.{" "}
              <Link href="/admin/settings/pricing" className="text-[#1565C0] hover:underline">
                Manage pricing rules →
              </Link>
            </p>
          )}
        </div>

        {/* Recalculate */}
        <div className="border-t border-[#E5E7EB] pt-4 space-y-3">
          {isStale && (
            <div className="flex items-center gap-2 rounded-lg bg-[#FFFBEB] border border-[#FCD34D] px-3 py-2">
              <AlertTriangle size={13} strokeWidth={1.5} className="text-[#D97706] flex-shrink-0" />
              <p className="text-xs text-[#D97706]">Intake data changed — recalculate to refresh.</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-[#6B7280]">
              Jurisdiction match + price calculation + workflow log.
            </p>
            <RecomputeProjectButton projectId={projectId} highlighted={isStale} />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminProjectDetailPage({
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
  const adminUserId = userData.user.id;

  const [project, designers] = await Promise.all([
    getProjectDetail(supabase, id),
    getDesigners(supabase),
  ]);

  if (!project) notFound();

  const [jurisdiction, packageJob, latestCompletedPackageJobData, workflowJobsData, tcdLibraryData, coverTemplatesData] = await Promise.all([
    project.jurisdiction_id ? getJurisdiction(supabase, project.jurisdiction_id) : null,
    getLatestJob(supabase, id, "generate_permit_package"),
    // Separate query for latest *completed* package job — used to drive View Package action.
    // packageJob above tracks the most recent job overall (may be queued/running/failed).
    supabase
      .from("workflow_jobs")
      .select("id, status, result, updated_at, created_at")
      .eq("project_id", id)
      .eq("job_type", "generate_permit_package")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workflow_jobs")
      .select("id, job_type, status, error, created_at, updated_at, completed_at, result")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("tcd_library")
      .select("id, code, description, category, state")
      .eq("is_active", true)
      .or(project.state ? `state.is.null,state.eq.${project.state}` : "state.is.null")
      .order("code", { ascending: true }),
    // Cover sheet templates filtered by project's authority_type
    (() => {
      const q = supabase
        .from("cover_sheet_templates")
        .select("id, name, authority_type, county")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      return project.authority_type
        ? q.or(`authority_type.is.null,authority_type.eq.${project.authority_type}`)
        : q;
    })(),
  ]);

  const latestCompletedPackageJob = latestCompletedPackageJobData.data ?? null;
  const workflowJobs = workflowJobsData.data ?? [];

  // Load all invoices (including void) + the latest pricing resolution. The
  // resolution feeds the PricingReviewPanel empty state with line-item-level
  // suggestions and a confidence indicator.
  const [projectInvoices, pricingResolution] = await Promise.all([
    getProjectInvoices(supabase, id),
    resolvePricing(supabase, id),
  ]);

  // Resolve effective authority ID for display and template matching.
  // Prefer manual projects.authority_id; fall back to jurisdictions.authority_profile_id.
  let effectiveAuthorityId = project.authority_id as string | null;
  if (!effectiveAuthorityId && project.jurisdiction_id) {
    const { data: jurAuth } = await supabase
      .from("jurisdictions")
      .select("authority_profile_id")
      .eq("id", project.jurisdiction_id)
      .single();
    effectiveAuthorityId = jurAuth?.authority_profile_id ?? null;
  }

  // Fetch authority profiles (for the selector dropdown)
  const { data: authorityProfilesData } = await supabase
    .from("authority_profiles")
    .select("id, name, type")
    .order("name", { ascending: true });

  // Fetch the full authority profile for the selected authority (panel + checklist)
  const { data: selectedAuthorityProfileData } = effectiveAuthorityId
    ? await supabase
        .from("authority_profiles")
        .select(
          "id, name, type, submission_method, output_format, notification_only, " +
          "requires_application, requires_certification, requires_coi, requires_pe, " +
          "requires_hard_copies, requires_certified_check, " +
          "contact_name, contact_email, contact_phone, " +
          "submission_instructions, internal_notes"
        )
        .eq("id", effectiveAuthorityId)
        .maybeSingle()
    : { data: null };

  const authorityProfiles: AuthorityProfileOption[] = (authorityProfilesData ?? []).map(
    (a: Record<string, unknown>) => ({
      id: a.id as string,
      name: a.name as string,
      type: a.type as string,
    })
  );

  // Determine the currently selected authority profile name (for display)
  const selectedAuthority = authorityProfiles.find((a) => a.id === effectiveAuthorityId) ?? null;

  // Fetch active blueprints for the BlueprintSelector dropdown, scoped to the
  // project's effective authority. Drafts and inactive blueprints are excluded —
  // only activated templates are valid choices for a real project. Drafts must
  // be activated in Settings before they can be assigned here.
  let activeBlueprints: BlueprintOption[] = [];
  if (effectiveAuthorityId) {
    const { data: activeBlueprintsData } = await supabase
      .from("package_blueprints")
      .select("id, description, work_type, status")
      .eq("authority_profile_id", effectiveAuthorityId)
      .eq("status", "active")
      .order("description", { ascending: true });
    activeBlueprints = (activeBlueprintsData ?? []).map(
      (b: Record<string, unknown>) => ({
        id: b.id as string,
        description: (b.description as string | null) ?? "(no description)",
        work_type: (b.work_type as string | null) ?? null,
        status: (b.status as string | null) ?? null,
      })
    );
  }

  // Authority's current active blueprint (for display in selector)
  let authorityActiveBlueprintId: string | null = null;
  if (effectiveAuthorityId) {
    const { data: authBp } = await supabase
      .from("package_blueprints")
      .select("id")
      .eq("authority_profile_id", effectiveAuthorityId)
      .eq("status", "active")
      .maybeSingle();
    authorityActiveBlueprintId = authBp?.id ?? null;
  }

  // Fetch slot assignments for the effective blueprint so the Composition card
  // and the Setup Readiness panel can show whether each slot is configured.
  // Uses the same priority as generation: project override > authority active.
  // Includes status so the readiness panel can distinguish "no template" from
  // "template assigned but not active" (e.g., a stale draft override).
  const effectiveBlueprintIdForSlots = project.blueprint_id ?? authorityActiveBlueprintId;
  type BlueprintSlotData = {
    status: string | null;
    cover_page_template_id: string | null;
    tcp_wrapper_id: string | null;
    tcd_wrapper_id: string | null;
    sld_wrapper_id: string | null;
    app_page_template_id: string | null;
    application_template_id: string | null;
    cert_page_template_id: string | null;
    certification_template_id: string | null;
    coi_template_id: string | null;
  };
  let blueprintSlotData: BlueprintSlotData | null = null;
  if (effectiveBlueprintIdForSlots) {
    const { data: bpSlotRaw } = await supabase
      .from("package_blueprints")
      .select(
        "status, cover_page_template_id, tcp_wrapper_id, tcd_wrapper_id, sld_wrapper_id, " +
        "app_page_template_id, application_template_id, " +
        "cert_page_template_id, certification_template_id, coi_template_id"
      )
      .eq("id", effectiveBlueprintIdForSlots)
      .maybeSingle();
    if (bpSlotRaw) {
      blueprintSlotData = bpSlotRaw as unknown as BlueprintSlotData;
    }
  }

  // Resolve effective per-requirement flags via tri-state override logic
  const _authProfileRaw = selectedAuthorityProfileData as unknown as Record<string, unknown> | null;
  const authorityDefaults: AuthorityRequirementDefaults | null = _authProfileRaw
    ? {
        requires_application:     _authProfileRaw.requires_application     as boolean,
        requires_certification:   _authProfileRaw.requires_certification   as boolean,
        requires_coi:             _authProfileRaw.requires_coi             as boolean,
        requires_pe:              _authProfileRaw.requires_pe              as boolean,
        requires_hard_copies:     _authProfileRaw.requires_hard_copies     as boolean,
        requires_certified_check: _authProfileRaw.requires_certified_check as boolean,
        notification_only:        _authProfileRaw.notification_only        as boolean,
      }
    : null;

  const projectOverrides: ProjectRequirementOverrides = {
    req_application_override:       project.req_application_override       ?? null,
    req_certification_override:     project.req_certification_override     ?? null,
    req_coi_override:               project.req_coi_override               ?? null,
    req_hard_copies_override:       project.req_hard_copies_override       ?? null,
    req_certified_check_override:   project.req_certified_check_override   ?? null,
    req_notification_only_override: project.req_notification_only_override ?? null,
    pe_required:                    project.pe_required                    ?? null,
  };

  const resolved = authorityDefaults
    ? resolveRequirements(authorityDefaults, projectOverrides)
    : null;

  // Count non-null overrides for the collapsed summary label
  const activeOverrideCount = [
    projectOverrides.req_application_override,
    projectOverrides.req_certification_override,
    projectOverrides.req_coi_override,
    projectOverrides.req_hard_copies_override,
    projectOverrides.req_certified_check_override,
    projectOverrides.req_notification_only_override,
    projectOverrides.pe_required,
  ].filter((v) => v !== null).length;

  // Generation gate: an authority must be linked to this project.
  // The permit_templates table was a planning artifact — package generation is
  // programmatic and does not depend on a template row. A linked authority is
  // the only configuration requirement before generation can proceed.
  const hasAuthority = effectiveAuthorityId !== null;

  // Staleness: intake data was edited after the last project_computed job ran.
  // computeProject writes the workflow_jobs row AFTER updating the project row,
  // so project_computed.created_at is always slightly after the compute's
  // project.updated_at bump. A subsequent intake edit bumps updated_at again,
  // making it newer than the last compute job.
  const lastComputeJob = workflowJobs.find(
    (j) => (j.job_type as string) === "project_computed"
  );
  const isIntelligenceStale =
    !lastComputeJob ||
    new Date(project.updated_at) > new Date(lastComputeJob.created_at);
  const tcdLibrary: TcdLibraryItem[] = (tcdLibraryData.data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    code: t.code as string,
    description: t.description as string,
    category: t.category as string | null,
    state: t.state as string | null,
  }));

  const coverTemplates = (coverTemplatesData.data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: t.name as string,
    authority_type: (t.authority_type as string | null) ?? null,
    county: (t.county as string | null) ?? null,
  }));

  // Fetch project files
  // Order: sort_order ASC NULLS LAST, then created_at ASC. Phase A added
  // sort_order for manual TCP ordering; existing rows have sort_order = NULL
  // and fall through to upload-order. SLD/intake/etc. carry NULL too, so the
  // tiebreaker (created_at) preserves their previous behavior unchanged.
  const { data: filesData } = await supabase
    .from("project_files")
    .select("id, file_name, file_category, created_at, uploaded_by, uploader_label, storage_path, mime_type, source")
    .eq("project_id", id)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const files = filesData ?? [];
  // Zone: CLIENT — intake-submitted files, read-only reference for admin
  const intakeFiles = files.filter((f) =>
    (CLIENT_FILE_CATEGORIES as readonly string[]).includes(f.file_category as string)
  );
  // Zone: ADMIN — SLD reference sheets uploaded by admin
  const sldFiles = files.filter((f) => f.file_category === FILE_CATEGORIES.SLD_SHEET);
  // Zone: DESIGNER — TCP sheets produced by the assigned designer
  const tcpFiles = files.filter((f) => f.file_category === FILE_CATEGORIES.TCP_PDF);
  // Zone: GENERATED — n8n-produced outputs (permit package, etc.)
  const generatedFiles = files.filter((f) =>
    (GENERATED_FILE_CATEGORIES as readonly string[]).includes(f.file_category as string)
  );

  // Permit package versions only — for the compact history card. Newest first.
  const packageVersionFiles = files
    .filter((f) => f.file_category === FILE_CATEGORIES.PERMIT_PACKAGE)
    .slice()
    .reverse();

  // Generate signed download URLs (1 hour TTL).
  // Service client bypasses storage RLS — session client returns "Object not found"
  // for files the anon/user policy does not cover.
  const storageClient = createServiceClient();
  const downloadUrls: Record<string, string> = {};
  for (const file of files) {
    const { data: urlData } = await storageClient.storage
      .from("project-files")
      .createSignedUrl((file as { storage_path: string }).storage_path, 3600);
    if (urlData?.signedUrl) {
      downloadUrls[file.id] = urlData.signedUrl;
    }
  }

  // Download-mode signed URLs for client intake files only.
  // These append &download= so the browser receives Content-Disposition: attachment.
  // Other file zones (SLD, TCP, generated) are not in scope for this change.
  const intakeDownloadUrls: Record<string, string> = {};
  for (const file of intakeFiles) {
    const { data: dlData } = await storageClient.storage
      .from("project-files")
      .createSignedUrl((file as { storage_path: string }).storage_path, 3600, { download: true });
    if (dlData?.signedUrl) {
      intakeDownloadUrls[file.id] = dlData.signedUrl;
    }
  }

  // Phase E — fetch the project cover map (one row per project) and sign a
  // 1-hour preview URL for the Setup-tab card. Wrapped defensively so a
  // missing table or stale schema cache cannot tank the whole page.
  // Phase F.5 — also sign the cropped path so the card can show before/after.
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
    const { data: coverRow, error: coverErr } = await storageClient
      .from("project_cover_maps")
      .select("storage_path, cropped_storage_path, raster_storage_path, raster_width, raster_height, crop_transform, file_name, mime_type, annotations")
      .eq("project_id", id)
      .maybeSingle();
    if (coverErr) {
      console.warn("[admin/projects/[id]] cover map lookup failed:", coverErr.message);
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
    console.warn("[admin/projects/[id]] cover map lookup threw:", e);
  }
  // Phase G — parse annotations defensively. The column may not exist yet on
  // older environments, in which case `annotations` simply stays null above.
  const coverMapAnnotations = coverMapAnnotationsRaw
    ? parseAnnotations(coverMapAnnotationsRaw)
    : null;
  if (coverMapPath) {
    try {
      const { data: signed, error: signErr } = await storageClient.storage
        .from("project-files")
        .createSignedUrl(coverMapPath, 60 * 60);
      if (signErr) {
        console.warn("[admin/projects/[id]] cover map sign URL failed:", signErr.message);
      } else {
        coverMapSignedUrl = signed?.signedUrl ?? null;
      }
    } catch (e) {
      console.warn("[admin/projects/[id]] cover map sign URL threw:", e);
    }
  }
  if (coverMapCroppedPath) {
    try {
      const { data: signed, error: signErr } = await storageClient.storage
        .from("project-files")
        .createSignedUrl(coverMapCroppedPath, 60 * 60);
      if (signErr) {
        console.warn("[admin/projects/[id]] cover map cropped sign URL failed:", signErr.message);
      } else {
        coverMapCroppedSignedUrl = signed?.signedUrl ?? null;
      }
    } catch (e) {
      console.warn("[admin/projects/[id]] cover map cropped sign URL threw:", e);
    }
  }
  // Phase 2 — sign the raster so the crop editor can render it client-side.
  // Legacy rows without raster_storage_path leave this null; the editor's
  // "Adjust Crop" button stays hidden in that case.
  if (coverMapRasterPath) {
    try {
      const { data: signed, error: signErr } = await storageClient.storage
        .from("project-files")
        .createSignedUrl(coverMapRasterPath, 60 * 60);
      if (signErr) {
        console.warn("[admin/projects/[id]] cover map raster sign URL failed:", signErr.message);
      } else {
        coverMapRasterSignedUrl = signed?.signedUrl ?? null;
      }
    } catch (e) {
      console.warn("[admin/projects/[id]] cover map raster sign URL threw:", e);
    }
  }

  // Signed URL for the latest *completed* permit package (from n8n result payload).
  // Uses latestCompletedPackageJob, not packageJob, so a newer queued/failed job
  // does not hide an already-completed package.
  let packageDownloadUrl: string | null = null;
  if (latestCompletedPackageJob) {
    const filePath = (latestCompletedPackageJob.result as Record<string, unknown> | null)?.file_path;
    if (filePath && typeof filePath === "string") {
      const { data: pkgUrlData } = await storageClient.storage
        .from("project-files")
        .createSignedUrl(filePath.replace(/^\/+/, ""), 3600);
      packageDownloadUrl = pkgUrlData?.signedUrl ?? null;
    }
  }

  // Fetch TCD selections — include tcd_library_item_id for the "already selected" set
  const { data: tcdData } = await supabase
    .from("project_tcd_selections")
    .select("id, sort_order, tcd_library_item_id, tcd_library ( code, description )")
    .eq("project_id", id)
    .order("sort_order", { ascending: true });

  const selectedTCDs = (tcdData ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,                    // selection row ID — used for Remove
    tcdItemId: row.tcd_library_item_id as string,
    code: (row.tcd_library as { code: string; description: string } | null)?.code ?? "—",
    description:
      (row.tcd_library as { code: string; description: string } | null)?.description ?? "",
  }));

  // Set of tcd_library IDs already added — passed to modal to hide already-selected items
  const selectedTcdItemIds = new Set(selectedTCDs.map((t) => t.tcdItemId));

  // Fetch project activity (displayed in Activity tab + passed to rail)
  const { data: activityData } = await supabase
    .from("project_activity")
    .select("id, actor_label, action, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const activity = (activityData ?? []) as {
    id: string; actor_label: string | null; action: string; created_at: string;
  }[];

  // Fetch project notes (right-rail notes feed — newest first) + last-seen in parallel
  const [{ data: notesData }, { data: adminLastSeenData }] = await Promise.all([
    supabase
      .from("project_messages")
      .select("id, sender_id, sender_label, sender_role, body, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversation_last_seen")
      .select("last_seen_at")
      .eq("project_id", id)
      .eq("user_id", adminUserId)
      .maybeSingle(),
  ]);

  // Mark conversation as seen on page open
  await supabase
    .from("conversation_last_seen")
    .upsert({ project_id: id, user_id: adminUserId, last_seen_at: new Date().toISOString() },
      { onConflict: "project_id,user_id" });

  const notes = (notesData ?? []) as NoteEntry[];

  const adminPrevLastSeen = (adminLastSeenData as { last_seen_at: string } | null)?.last_seen_at ?? null;
  const adminUnreadCount = adminPrevLastSeen
    ? notes.filter(
        (n) => n.sender_id !== adminUserId && new Date(n.created_at) > new Date(adminPrevLastSeen)
      ).length
    : notes.filter((n) => n.sender_id !== adminUserId).length;

  // Fetch project updates (internal — admin + designer only)
  const { data: updatesData } = await supabase
    .from("project_updates")
    .select("id, body, status, created_by, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const projectUpdates = (updatesData ?? []) as {
    id: string;
    body: string | null;
    status: string | null;
    created_by: string;
    created_at: string;
  }[];

  // Stale update tracking — uses the configured cadence, not a hardcoded threshold
  const staleDays = await getUpdateCadenceDays(supabase);
  const lastUpdateAt = projectUpdates[0]?.created_at ?? null;
  const daysSinceUpdate = lastUpdateAt
    ? Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 86_400_000)
    : null;
  const isUpdateStale = daysSinceUpdate === null || daysSinceUpdate >= staleDays;

  // Designer display — sign avatar URL if available
  const designerName = project.assigned_designer_name;
  let designerAvatarUrl: string | null = null;
  if (project.assigned_designer_avatar_url) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(project.assigned_designer_avatar_url, 3600);
    designerAvatarUrl = signed?.signedUrl ?? null;
  }

  // Authority display
  const authorityDisplay = (() => {
    if (project.authority_type === "njdot") return "NJDOT";
    if (project.county) return `${project.county} County`;
    if (project.city) return project.city;
    return humanize(project.authority_type);
  })();

  const inReview = project.status === "waiting_for_admin_review";
  const isTerminal = project.status === "closed" || project.status === "cancelled";
  // isEarlySetup: admin can trigger "Mark Setup Complete" to move into ready_for_assignment
  const isEarlySetup = project.status === "intake_review" || project.status === "waiting_on_client";

  // Permit Package card prerequisites
  const hasTemplate = hasAuthority;
  const prereqs = {
    sld:      sldFiles.length > 0,
    tcd:      selectedTCDs.length > 0,
    tcp:      tcpFiles.length > 0,
    approved: !["intake_review", "waiting_on_client", "ready_for_assignment",
                "assigned", "in_design", "waiting_for_admin_review",
                "revisions_required", "cancelled"].includes(project.status),
    template: hasTemplate,
  };
  const prereqsMet = prereqs.sld && prereqs.tcd && prereqs.tcp && prereqs.approved && prereqs.template;
  const canGenerate = prereqsMet && project.status === "approved";
  const hasCompletedPackage = !!latestCompletedPackageJob && !!packageDownloadUrl;

  // ── Setup Readiness inputs (Pass 6) ──────────────────────────────────────────
  // hasActiveTemplate: an effective blueprint resolves AND it is currently
  // status="active". After Pass 1 this is the normal case; the explicit check
  // covers stale draft overrides on legacy projects.
  const hasActiveTemplate =
    !!effectiveBlueprintIdForSlots && blueprintSlotData?.status === "active";

  const missingBlueprintSections = hasActiveTemplate
    ? getBlueprintMissingRequired(
        blueprintSlotData as unknown as Record<string, unknown>
      )
    : [];

  // Effective Application Form requirement (authority defaults + project overrides).
  const effectiveRequiresApplication =
    (resolved?.requiresApplication ?? authorityDefaults?.requires_application) ?? false;

  // Whether the active blueprint actually has an Application Form template
  // (either the Pass 2 P1 column or the legacy P2 column).
  const hasApplicationFormTemplate =
    hasActiveTemplate &&
    !!(
      blueprintSlotData?.app_page_template_id ||
      blueprintSlotData?.application_template_id
    );

  const hasDesigner = !!project.assigned_designer_id;

  // ── Authority profile + submission checklist ─────────────────────────────────
  const authorityProfile = (selectedAuthorityProfileData ?? null) as AuthorityProfile | null;

  // Per-category separate output file arrays for SeparateOutputRow — newest first.
  function buildOutputFiles(category: string): SeparateOutputFile[] {
    return files
      .filter((f) => f.file_category === category)
      .slice()
      .reverse()
      .map((f) => ({
        id: f.id,
        file_name: f.file_name,
        created_at: f.created_at,
        source: (f as { source?: string | null }).source ?? null,
        url: downloadUrls[f.id] ?? null,
      }));
  }
  const applicationFormFiles   = buildOutputFiles("application_form");
  const certificationFormFiles = buildOutputFiles("certification_form");
  const coiFiles               = buildOutputFiles("coi");

  const applicationFormFile  = files.findLast((f) => f.file_category === "application_form") ?? null;
  const hasApplicationFile   = !!applicationFormFile;
  const hasCertificationFile = files.some((f) => f.file_category === "certification_form");
  const hasCOIFile           = files.some((f) => f.file_category === "coi");
  const hasPEFile            = files.some((f) => f.file_category === "pe_stamp");

  // Permit documents received from the authority (uploaded post-submission).
  const permitDocFiles = files.filter((f) => f.file_category === "permit_document");

  const submissionChecklist: ChecklistItem[] = [
    {
      label: "Permit Package Generated",
      required: true,
      met: hasCompletedPackage,
      detail: hasCompletedPackage ? "Package is ready." : "Generate the permit package above.",
    },
    {
      label: "Application Form",
      required: resolved?.requiresApplication ?? authorityProfile?.requires_application ?? false,
      met: hasApplicationFile,
      detail: !(resolved?.requiresApplication ?? authorityProfile?.requires_application)
        ? undefined
        : hasApplicationFile
        ? "Application form is on file."
        : "Generate the permit package — the application form is produced automatically if an overlay template is configured.",
    },
    {
      label: "Certification Form",
      required: resolved?.requiresCertification ?? authorityProfile?.requires_certification ?? false,
      met: hasCertificationFile,
      detail: !(resolved?.requiresCertification ?? authorityProfile?.requires_certification)
        ? undefined
        : hasCertificationFile
        ? "Auto-generated from overlay template."
        : "Generate the permit package — the certification form is produced automatically if an overlay template is configured.",
    },
    {
      label: "Certificate of Insurance (COI)",
      required: resolved?.requiresCoi ?? authorityProfile?.requires_coi ?? false,
      met: hasCOIFile,
      detail: !(resolved?.requiresCoi ?? authorityProfile?.requires_coi)
        ? undefined
        : hasCOIFile
        ? "COI on file."
        : "Attach COI before submission.",
    },
    {
      label: "PE Stamp",
      required: resolved?.requiresPe ?? project.pe_required === true,
      met: hasPEFile,
      detail: !(resolved?.requiresPe ?? project.pe_required === true)
        ? undefined
        : hasPEFile
        ? "PE stamp file uploaded."
        : "PE stamp must be applied before submission.",
    },
    {
      label: "Hard Copies Required",
      required: resolved?.requiresHardCopies ?? authorityProfile?.requires_hard_copies ?? false,
      met: false,
      detail: (resolved?.requiresHardCopies ?? authorityProfile?.requires_hard_copies)
        ? "Physical copies must be prepared and delivered."
        : undefined,
    },
    {
      label: "Certified Check Required",
      required: resolved?.requiresCertifiedCheck ?? authorityProfile?.requires_certified_check ?? false,
      met: false,
      detail: (resolved?.requiresCertifiedCheck ?? authorityProfile?.requires_certified_check)
        ? "Payment must be by certified check — prepare before submission."
        : undefined,
    },
    {
      label: `Submission via ${authorityProfile?.submission_method ? (
        { email: "Email", portal: "Online Portal", mail: "Mail", courier: "Courier", in_person: "In-person" }[authorityProfile.submission_method] ?? authorityProfile.submission_method
      ) : "—"}`,
      required: !!authorityProfile?.submission_method,
      met: false,
      detail: authorityProfile?.submission_method
        ? "Confirm submission method before sending."
        : undefined,
    },
  ];

  // Derive a display status: once a package exists, show "ready_for_submission"
  // even if the DB record still reads "approved" (n8n may not have transitioned it).
  const displayStatus = hasCompletedPackage && project.status === "approved"
    ? "ready_for_submission" as const
    : project.status;

  const { tab } = await searchParams;
  const currentUserRole = (userData.user.app_metadata as { role?: string })?.role ?? "admin";
  // Tab locking on the admin workspace is always role="admin" — the route is already
  // guarded to admin users. currentUserRole (from app_metadata) is kept for section-level
  // permissions passed to ProjectRail, not for determining which tabs are clickable.
  const activeTab: WorkspaceTab = resolveActiveTab(tab, "admin", displayStatus);

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Sticky project header ── */}
      <div className="flex-shrink-0 bg-white border-b border-[#E5E7EB] px-8 py-4 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <Link href="/admin/projects" className="text-[12px] text-[#6B7280] hover:text-[#111827] transition-colors">
              Projects
            </Link>
            <span className="text-[12px] text-[#9CA3AF]">/</span>
            <span className="text-[12px] text-[#6B7280] font-mono">{project.job_number}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[20px] font-bold text-[#111827]">{project.job_name}</h1>
            <ProjectStatusBadge status={project.unified_status} />
          </div>
          <p className="text-[12px] text-[#6B7280] mt-0.5">
            {project.company_name ?? "—"} · {authorityDisplay}
          </p>
        </div>

        {/* Quick approve button in header when in review */}
        {inReview && (
          <div className="flex-shrink-0">
            <ApproveDesignForm projectId={project.id} />
          </div>
        )}
      </div>

      {/* ── Tab navigation ── */}
      <ProjectWorkspaceTabs projectId={project.id} activeTab={activeTab} currentUserRole="admin" />

      {/* ── Two-column body ── */}
      <div className="flex-1 flex min-h-0">
        <div className="flex gap-0 min-h-0 flex-1">

          {/* ── Left: main workflow sections ── */}
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

            {/* 1. Core Intake Data */}
            <EditIntakeForm project={project} />

            {/* 2. Client Intake Files */}
            <SectionCard flat
              id="section-intake"
              title="Client Intake Files"
              description="Files submitted by the client with this request."
            >
              {intakeFiles.length === 0 ? (
                <p className="text-sm text-[#6B7280]">
                  No files submitted by the client. They may not have included attachments, or files are still pending.
                </p>
              ) : (
                <div className="divide-y divide-[#E5E7EB]">
                  {intakeFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileTypeBadge fileName={f.file_name} />
                        <div className="min-w-0">
                          <p className="text-sm text-[#111827] truncate">{f.file_name}</p>
                          <p className="text-xs text-[#6B7280]">
                            {FILE_CATEGORY_LABELS[f.file_category as keyof typeof FILE_CATEGORY_LABELS] ?? f.file_category}
                            {f.uploader_label ? ` · ${f.uploader_label}` : ""}
                            {" · "}
                            {formatDateTime(f.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {isBrowserViewable((f as { mime_type?: string | null }).mime_type) && downloadUrls[f.id] ? (
                          <a
                            href={downloadUrls[f.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#1565C0] hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-xs text-[#9CA3AF]" title="This file type cannot be previewed in the browser">
                            View
                          </span>
                        )}
                        {intakeDownloadUrls[f.id] && (
                          <FileDownloadLink href={intakeDownloadUrls[f.id]} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* 3. SLD / Reference Drawings */}
            <SectionCard flat
              id="section-sld"
              title="Reference Drawings (SLD)"
              description="Single-line diagram drawings received with this intake. Must be uploaded before the designer can begin."
            >
              {sldFiles.length === 0 && (
                <p className="text-sm text-[#6B7280] mb-4">
                  No reference drawings uploaded yet. Upload the SLD sheets provided by the client before proceeding to Setup.
                </p>
              )}
              {sldFiles.length > 0 && (
                <div className="divide-y divide-[#E5E7EB] mb-4">
                  {sldFiles.map((f) => {
                    const sldFile = f as { id: string; file_name: string; created_at: string; uploader_label?: string | null };
                    return (
                      <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileTypeBadge fileName={sldFile.file_name} />
                          <div className="min-w-0">
                            <p className="text-sm text-[#111827] truncate">{sldFile.file_name}</p>
                            <p className="text-xs text-[#6B7280]">
                              {sldFile.uploader_label ? `${sldFile.uploader_label} · ` : ""}
                              {formatDate(sldFile.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {downloadUrls[f.id] ? (
                            <a
                              href={downloadUrls[f.id]}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`View ${sldFile.file_name}`}
                              aria-label={`View ${sldFile.file_name}`}
                              className="p-1.5 rounded text-[#6B7280] hover:text-[#1565C0] transition-colors"
                            >
                              <Eye size={14} strokeWidth={1.5} />
                            </a>
                          ) : (
                            <span className="p-1.5 text-[#9CA3AF]">
                              <Eye size={14} strokeWidth={1.5} />
                            </span>
                          )}
                          <DeleteSLDButton
                            fileId={sldFile.id}
                            projectId={project.id}
                            fileName={sldFile.file_name}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <UploadSLDForm projectId={project.id} />
            </SectionCard>

            </>
            )}

            {/* ── Setup tab ── */}
            {activeTab === "setup" && (
            <>

            {/* 1. Authority & Template — the driver */}
            <SectionCard flat
              title="Authority & Template"
              description="Select the permitting authority governing this job. Requirements, templates, and submission rules all flow from this choice. Required before design can begin."
            >
              <div className="space-y-5">

                {/* Authority selector */}
                <div>
                  <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">
                    Permitting Authority
                  </p>
                  {authorityProfiles.length === 0 ? (
                    <p className="text-sm text-[#6B7280]">
                      No authority profiles found.{" "}
                      <Link href="/admin/settings/authorities" className="text-[#1565C0] hover:underline">
                        Add in Settings →
                      </Link>
                    </p>
                  ) : (
                    <AuthoritySelector
                      key={effectiveAuthorityId ?? "none"}
                      projectId={project.id}
                      currentAuthorityId={effectiveAuthorityId}
                      authorities={authorityProfiles}
                    />
                  )}
                  {selectedAuthority && (
                    <p className="mt-1.5 text-xs text-[#6B7280]">
                      <span className="text-[#111827] font-medium">{selectedAuthority.name}</span>
                      {" "}
                      <span className="text-[#9CA3AF]">({selectedAuthority.type})</span>
                    </p>
                  )}
                </div>

                {/* Package Template */}
                <div className="border-t border-[#E5E7EB] pt-4">
                  <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">
                    Package Template
                  </p>
                  <BlueprintSelector
                    projectId={project.id}
                    currentBlueprintId={project.blueprint_id ?? null}
                    authorityActiveBlueprintId={authorityActiveBlueprintId}
                    blueprints={activeBlueprints}
                    hasAuthority={!!effectiveAuthorityId}
                  />
                </div>

              </div>
            </SectionCard>

            {/* 2. TCD Selection — moved up; happens early in real workflow */}
            <SectionCard flat
              id="section-tcd"
              title="TCD Selection"
              description="Select the traffic control devices required for this project. Curated from the library based on project state and scope. Required before design can begin."
              action={
                <TcdLibraryModal
                  projectId={project.id}
                  projectState={project.state}
                  library={tcdLibrary}
                  selectedIds={selectedTcdItemIds}
                />
              }
            >
              {selectedTCDs.length === 0 ? (
                <p className="text-sm text-[#6B7280]">No TCD sheets selected yet. Add from the library to define the device set for this project.</p>
              ) : (
                <div className="space-y-2">
                  {selectedTCDs.map((tcd) => (
                    <div key={tcd.id} className="flex items-center justify-between gap-4 bg-[#F8F9FB] rounded-lg px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-[#111827]">{tcd.code}</p>
                        <p className="text-xs text-[#6B7280]">{tcd.description}</p>
                      </div>
                      <RemoveTCDButton selectionId={tcd.id} projectId={project.id} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* 3. Authority Requirements — concise summary + collapsible overrides */}
            <SectionCard flat
              title="Authority Requirements"
              description="Requirements derived from the selected authority. Apply project-specific overrides as needed before assigning a designer."
            >
              {!authorityProfile ? (
                <p className="text-sm text-[#6B7280]">
                  Select a permitting authority above to see requirements.
                </p>
              ) : (
                <div className="space-y-4">

                  {/* Submission method + output format */}
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    {authorityProfile.submission_method && (
                      <div>
                        <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Submission</p>
                        <p className="text-sm text-[#111827]">
                          {({
                            email:     "Email",
                            portal:    "Online Portal",
                            mail:      "Mail",
                            courier:   "Courier / Drop-off",
                            in_person: "In-person Appointment",
                          } as Record<string, string>)[authorityProfile.submission_method] ?? authorityProfile.submission_method}
                        </p>
                      </div>
                    )}
                    {authorityProfile.output_format && (
                      <div>
                        <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-0.5">Format</p>
                        <p className="text-sm text-[#111827]">{authorityProfile.output_format}</p>
                      </div>
                    )}
                  </div>

                  {/* Notification only */}
                  {(resolved?.notificationOnly ?? authorityProfile.notification_only) && (
                    <div>
                      <span className="text-[10px] font-medium text-[#D97706] bg-[#FFFBEB] rounded px-1.5 py-0.5">
                        Notification Only — no permit decision
                      </span>
                    </div>
                  )}

                  {/* Required documents — derived from authority + active overrides */}
                  {(() => {
                    const reqDocs = [
                      { label: "Application Form", active: resolved?.requiresApplication    ?? authorityProfile.requires_application },
                      { label: "Certification",    active: resolved?.requiresCertification  ?? authorityProfile.requires_certification },
                      { label: "COI",              active: resolved?.requiresCoi            ?? authorityProfile.requires_coi },
                      { label: "PE Stamp",         active: resolved?.requiresPe             ?? (project.pe_required === true) },
                      { label: "Hard Copies",      active: resolved?.requiresHardCopies     ?? authorityProfile.requires_hard_copies },
                      { label: "Certified Check",  active: resolved?.requiresCertifiedCheck ?? authorityProfile.requires_certified_check },
                    ].filter((f) => f.active);
                    if (reqDocs.length === 0) return null;
                    return (
                      <div>
                        <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-1.5">Required Documents</p>
                        <div className="flex flex-wrap gap-1.5">
                          {reqDocs.map((f) => (
                            <span key={f.label} className="text-[10px] font-medium bg-[#EFF6FF] text-[#1565C0] rounded px-1.5 py-0.5">
                              {f.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Project Overrides — collapsible, closed by default */}
                  <details className="group border-t border-[#E5E7EB] pt-4">
                    <summary className="list-none cursor-pointer flex items-center justify-between gap-2 select-none [&::-webkit-details-marker]:hidden">
                      <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">
                        Project Overrides
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#9CA3AF]">
                          {activeOverrideCount === 0
                            ? "Using authority defaults"
                            : `${activeOverrideCount} override${activeOverrideCount !== 1 ? "s" : ""} active`}
                        </span>
                        <ChevronDown size={14} strokeWidth={1.5} className="text-[#6B7280] transition-transform group-open:rotate-180" />
                      </div>
                    </summary>
                    <div className="mt-3">
                      <RequirementOverridesForm
                        projectId={project.id}
                        authority={authorityDefaults}
                        overrides={projectOverrides}
                      />
                    </div>
                  </details>

                </div>
              )}
            </SectionCard>

            </>
            )}

            {activeTab === "design" && (
            <>

            {/* Phase J — Project Cover Map (moved from Setup tab to Design tab).
                Designers and admins both manage cover maps + work paths here. */}
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

            {/* 7. TCP Design Files */}
            <SectionCard flat
              id="section-tcp"
              title="TCP Design Files"
              action={<UploadTCPAdminForm projectId={project.id} />}
            >
              {tcpFiles.length === 0 ? (
                <p className="text-sm text-[#6B7280]">
                  {designerName
                    ? `Awaiting TCP upload from ${designerName}.`
                    : "No TCP sheets yet. Use the button above to upload, or assign a designer."}
                </p>
              ) : (
                <TcpSheetList
                  projectId={project.id}
                  canReorder
                  showUploaderLabel
                  files={tcpFiles.map((f) => {
                    const r = f as { id: string; file_name: string; created_at: string; uploader_label?: string | null };
                    return {
                      id: r.id,
                      file_name: r.file_name,
                      created_at: r.created_at,
                      uploader_label: r.uploader_label ?? null,
                      signedUrl: downloadUrls[r.id] ?? null,
                    };
                  })}
                />
              )}
            </SectionCard>

            {/* 8. Admin Review & Approval */}
            <SectionCard flat
              title="Admin Review & Approval"
              description="Review TCP sheets above, then approve the design or request revisions."
            >
              {inReview ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-[#EFF6FF] border border-[#1565C0]/30 rounded-lg px-4 py-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1565C0] flex-shrink-0" />
                    <p className="text-sm font-medium text-[#111827]">
                      {designerName ?? "Designer"} has submitted TCP sheets for review.
                    </p>
                  </div>
                  <DesignReviewPanel projectId={project.id} />
                </div>
              ) : project.status === "revisions_required" ? (
                <div className="flex items-start gap-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-[#111827]">
                    Revisions have been requested. Awaiting revised TCP sheets from{" "}
                    {designerName ?? "designer"}.
                  </p>
                </div>
              ) : ["approved", "package_generating", "ready_for_submission", "submitted",
                   "waiting_on_authority", "authority_action_needed", "permit_received", "closed"].includes(project.status) ? (
                <div className="flex items-center gap-2 text-sm text-[#16A34A]">
                  <CheckCircle2 size={16} strokeWidth={1.5} className="flex-shrink-0" />
                  Design approved. Package generation is now eligible.
                </div>
              ) : (
                <p className="text-sm text-[#6B7280]">Awaiting designer submission.</p>
              )}
            </SectionCard>

            </>
            )}

            {activeTab === "package" && (
            <>

            {/* Package Composition — structure + readiness at a glance */}
            {(() => {
              const effectiveBlueprintId = project.blueprint_id ?? authorityActiveBlueprintId;
              const effectiveBlueprint = activeBlueprints.find((b) => b.id === effectiveBlueprintId) ?? null;
              const isAuthorityDefault = !project.blueprint_id && !!authorityActiveBlueprintId;

              const missingItems = [
                !prereqs.sld      && "SLD Sheets",
                !prereqs.tcd      && "TCD Selection",
                !prereqs.tcp      && "TCP Sheets",
                !prereqs.approved && "Design Approval",
                !prereqs.template && "Authority",
                // Required separate outputs — display-only gating
                (resolved?.requiresApplication    ?? authorityProfile?.requires_application)    && !hasApplicationFile   && "Application Form",
                (resolved?.requiresCertification  ?? authorityProfile?.requires_certification)  && !hasCertificationFile && "Certification Form",
                (resolved?.requiresCoi            ?? authorityProfile?.requires_coi)            && !hasCOIFile           && "COI",
              ].filter(Boolean) as string[];

              // Build deterministic page manifest from currently-loaded data.
              // tcpFiles and sldFiles are sorted by created_at ASC (from the main query).
              // selectedTCDs is sorted by sort_order ASC (from its own query).
              // NOTE: the row strings below ("Cover template configured · …",
              // "No sheets uploaded", etc.) are mirrored byte-for-byte by
              // buildPackageCompositionFacts in src/lib/queries/packageComposition.ts
              // (consumed by the designer Package tab). Update both together.
              const manifest = buildPageManifest(
                tcpFiles.map((f) => ({ id: f.id, file_name: (f as { file_name: string }).file_name })),
                selectedTCDs.map((t) => ({ tcdItemId: t.tcdItemId, code: t.code })),
                sldFiles.map((f) => ({ id: f.id, file_name: (f as { file_name: string }).file_name })),
              );

              const CompositionRow = ({
                label,
                met,
                detail,
                sub,
              }: {
                label: string;
                met: boolean;
                detail: string;
                sub?: string;
              }) => (
                <div className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: met ? "#dcfce7" : "#f3f4f6" }}
                  >
                    {met ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                        <path d="M2 5l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-300 block" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{label}</p>
                      <span className={`text-xs flex-shrink-0 ${met ? "text-emerald-700" : "text-muted"}`}>{detail}</span>
                    </div>
                    {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
                  </div>
                </div>
              );

              return (
                <SectionCard flat
                  id="section-composition"
                  title="Package Composition"
                  description="What will be assembled into the permit package, in order."
                >
                  <div className="space-y-5">

                    {/* Template */}
                    <div>
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Active Template</p>
                      {effectiveBlueprint ? (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-ink">{effectiveBlueprint.description}</p>
                            <p className="text-xs text-muted mt-0.5">
                              {isAuthorityDefault ? "Authority default" : "Admin override"}
                              {effectiveBlueprint.work_type ? ` · ${effectiveBlueprint.work_type}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!isAuthorityDefault && (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                                Override
                              </span>
                            )}
                            <Link
                              href={`/admin/projects/${project.id}?tab=setup`}
                              className="text-xs text-primary hover:underline"
                            >
                              Change →
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-muted">No template selected.</p>
                          <Link
                            href={`/admin/projects/${project.id}?tab=setup`}
                            className="text-xs text-primary hover:underline flex-shrink-0"
                          >
                            Configure in Setup →
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Assembly layers with page ranges */}
                    <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-4 space-y-3">
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-3">
                        Assembly Order — Main Package
                      </p>
                      <CompositionRow
                        label="Cover Sheet"
                        met={!!blueprintSlotData?.cover_page_template_id}
                        detail={
                          blueprintSlotData?.cover_page_template_id
                            ? `Cover template configured · ${formatPageRange(manifest.sectionRanges.cover, manifest.totalPages)}`
                            : effectiveBlueprintIdForSlots
                            ? "No cover template assigned to this blueprint"
                            : "No blueprint selected — cover template not available"
                        }
                      />
                      <CompositionRow
                        label="TCP Sheets"
                        met={prereqs.tcp}
                        detail={
                          tcpFiles.length > 0
                            ? `${tcpFiles.length} sheet${tcpFiles.length !== 1 ? "s" : ""} · ${formatPageRange(manifest.sectionRanges.tcp, manifest.totalPages)}`
                            : "No sheets uploaded"
                        }
                      />
                      <CompositionRow
                        label="TCD Sheets"
                        met={prereqs.tcd}
                        detail={
                          selectedTCDs.length > 0
                            ? `${selectedTCDs.length} selected · ${formatPageRange(manifest.sectionRanges.tcd, manifest.totalPages)}`
                            : "No sheets selected"
                        }
                      />
                      <CompositionRow
                        label="SLD Sheets"
                        met={prereqs.sld}
                        detail={
                          sldFiles.length > 0
                            ? `${sldFiles.length} drawing${sldFiles.length !== 1 ? "s" : ""} · ${formatPageRange(manifest.sectionRanges.sld, manifest.totalPages)}`
                            : "No drawings uploaded"
                        }
                      />
                    </div>

                    {/* Readiness summary with total page count */}
                    <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-4">
                      {missingItems.length === 0 ? (
                        <div className="space-y-1.5">
                          <span className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                              <circle cx="6" cy="6" r="5" fill="#dcfce7" />
                              <path d="M3 6l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Ready to generate
                          </span>
                          <p className="text-xs text-muted pl-0.5">
                            {manifest.totalPages} page{manifest.totalPages !== 1 ? "s" : ""} total
                            {" · "}1 cover
                            {manifest.sectionCounts.tcp > 0 ? ` · ${manifest.sectionCounts.tcp} TCP` : ""}
                            {manifest.sectionCounts.tcd > 0 ? ` · ${manifest.sectionCounts.tcd} TCD` : ""}
                            {manifest.sectionCounts.sld > 0 ? ` · ${manifest.sectionCounts.sld} SLD` : ""}
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
                            Not ready — {missingItems.length} item{missingItems.length !== 1 ? "s" : ""} needed
                          </span>
                          <p className="text-xs text-muted pl-0.5">
                            Missing: {missingItems.join(", ")}
                            {manifest.totalPages > 1 && (
                              <span className="ml-2 text-faint">
                                ({manifest.totalPages} page{manifest.totalPages !== 1 ? "s" : ""} so far)
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                </SectionCard>
              );
            })()}

            {/* Package History — latest prominent, older versions collapsed */}
            {packageVersionFiles.length > 0 && (() => {
              const current = packageVersionFiles[0];
              const older = packageVersionFiles.slice(1);
              const currentUrl = downloadUrls[current.id];
              return (
                <SectionCard flat id="section-generated" title="Package History">
                  {/* Current / latest package */}
                  <div className="flex items-center justify-between gap-4 bg-emerald-50 rounded-xl px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                          Current
                        </span>
                        <p className="text-xs text-emerald-600 tabular-nums">
                          {formatDateTime(current.created_at)}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-emerald-800">{current.file_name}</p>
                    </div>
                    {currentUrl ? (
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white"
                        style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-faint flex-shrink-0">—</span>
                    )}
                  </div>

                  {/* Older versions — collapsed by default */}
                  {older.length > 0 && (
                    <details className="mt-3">
                      <summary className="list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">
                        <span className="text-xs text-muted hover:text-dim transition-colors">
                          View past packages ({older.length})
                        </span>
                      </summary>
                      <div className="mt-2 divide-y divide-surface">
                        {older.map((f, i) => {
                          const versionNumber = packageVersionFiles.length - 1 - i;
                          const url = downloadUrls[f.id];
                          return (
                            <div key={f.id} className="flex items-center justify-between gap-3 py-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[10px] font-semibold text-muted tabular-nums flex-shrink-0">
                                  v{versionNumber}
                                </span>
                                <p className="text-xs text-muted tabular-nums">{formatDateTime(f.created_at)}</p>
                              </div>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-dim hover:underline flex-shrink-0"
                                >
                                  View
                                </a>
                              ) : (
                                <span className="text-xs text-faint flex-shrink-0">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </SectionCard>
              );
            })()}

            {/* Generate Package — action card */}
            <PackageJobPoller status={packageJob?.status} />
            <SectionCard flat
              title="Generate Package"
              action={
                hasTemplate ? (
                  <GeneratePackageButton
                    projectId={project.id}
                    canGenerate={canGenerate}
                    coverTemplates={coverTemplates}
                    compact
                    latestCompletedJobId={latestCompletedPackageJob?.id}
                    latestJobStatus={packageJob?.status}
                  />
                ) : undefined
              }
            >
              <div className="space-y-4">

                {/* Not ready hint */}
                {!prereqsMet && (
                  <p className="text-sm text-muted">
                    Complete the composition requirements above before generating.
                  </p>
                )}

                {/* Manual upload — when no template matched */}
                {!hasTemplate && prereqs.approved && (
                  <div className={prereqsMet ? "" : "pt-2"}>
                    <ManualPackageUpload projectId={project.id} />
                  </div>
                )}

                {/* Completed package — primary state */}
                {hasCompletedPackage && (
                  <div className="flex items-center justify-between gap-4 bg-emerald-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Package ready</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Generated {formatDateTime(latestCompletedPackageJob!.updated_at ?? latestCompletedPackageJob!.created_at)}
                      </p>
                    </div>
                    <a
                      href={packageDownloadUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
                    >
                      View Package
                    </a>
                  </div>
                )}

                {/* In-flight job status */}
                {packageJob && packageJob.status !== "completed" && (packageJob.status === "failed" || !hasCompletedPackage) && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        packageJob.status === "failed"    ? "bg-red-500" :
                        packageJob.status === "running"   ? "bg-blue-500 animate-pulse" :
                        packageJob.status === "cancelled" ? "bg-gray-400" :
                        "bg-amber-400"
                      }`}
                    />
                    <span className={`text-sm font-medium ${JOB_STATUS_COLOR[packageJob.status as WorkflowJobStatus] ?? "text-muted"}`}>
                      {JOB_STATUS_LABEL[packageJob.status as WorkflowJobStatus] ?? packageJob.status}
                    </span>
                    <span className="text-xs text-muted">· {formatDate(packageJob.updated_at ?? packageJob.created_at)}</span>
                    {packageJob.error && (
                      <span className="text-xs text-red-600 ml-1">— {packageJob.error}</span>
                    )}
                  </div>
                )}

                {/* Context hint */}
                {(hasCompletedPackage || (!prereqsMet && hasTemplate)) && (
                  <p className="text-xs text-muted">
                    {hasCompletedPackage && canGenerate
                      ? "Regenerate to rebuild the package with current files."
                      : hasCompletedPackage
                      ? "A package is already on file."
                      : "Complete prerequisites above to enable generation."}
                  </p>
                )}

              </div>
            </SectionCard>

            {/* Separate Outputs — always visible; documents outside the main package */}
            <SectionCard flat
              title="Separate Outputs"
              description="Documents submitted alongside the main package. Required outputs must be on file before submission."
            >
              <div className="divide-y divide-surface">
                <SeparateOutputRow
                  name="Application Form"
                  required={!!(resolved?.requiresApplication ?? authorityProfile?.requires_application)}
                  projectId={project.id}
                  category="application_form"
                  files={applicationFormFiles}
                />
                <SeparateOutputRow
                  name="Certification Form"
                  required={!!(resolved?.requiresCertification ?? authorityProfile?.requires_certification)}
                  projectId={project.id}
                  category="certification_form"
                  files={certificationFormFiles}
                />
                <SeparateOutputRow
                  name="Certificate of Insurance (COI)"
                  required={!!(resolved?.requiresCoi ?? authorityProfile?.requires_coi)}
                  projectId={project.id}
                  category="coi"
                  files={coiFiles}
                />
              </div>
            </SectionCard>

            </>
            )}

            {activeTab === "submission" && (
            <>

            {/* 11. Submission & Permit Tracking */}
            <SectionCard flat
              title="Submission & Permit Tracking"
              description="Track the submission to the government authority and record the permit outcome."
            >
              <SubmissionTrackingPanel
                project={project}
                authority={authorityProfile}
                hasApplicationFile={hasApplicationFile}
                hasCertificationFile={hasCertificationFile}
                permitDocFiles={permitDocFiles}
                downloadUrls={downloadUrls}
                markReadyForSubmission={markReadyForSubmission}
                recordSubmission={recordSubmission}
                markWaitingOnAuthority={markWaitingOnAuthority}
                markAuthorityActionNeeded={markAuthorityActionNeeded}
                markPermitReceived={markPermitReceived}
                saveSubmissionFields={saveSubmissionFields}
              />
            </SectionCard>

            </>
            )}

            {activeTab === "billing" && (
            <>

            {/* 12. Billing & Invoice */}
            <div id="section-billing">
              <SectionCard flat
                title="Billing & Invoice"
                description="Manage pricing, invoice status, and payment tracking for this project."
              >
                <BillingPanel
                  project={project}
                  invoices={projectInvoices}
                  invoiceActions={{
                    createInvoiceFromProject,
                    updateDraftInvoice,
                    addInvoiceLineItem,
                    updateInvoiceLineItem,
                    deleteInvoiceLineItem,
                    sendInvoice,
                    markInvoicePartiallyPaid,
                    markInvoicePaid,
                    voidInvoice,
                    deleteDraftInvoice,
                  }}
                  pricingResolution={pricingResolution}
                />
              </SectionCard>
            </div>

            </>
            )}

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
                    {daysSinceUpdate === 0
                      ? "today"
                      : daysSinceUpdate === 1
                      ? "yesterday"
                      : `${daysSinceUpdate}d ago`}
                  </span>
                )}
              </div>
              <ActivityComposer
                projectId={id}
                revalidatePath={`/admin/projects/${id}`}
                stale={isUpdateStale}
                staleDayCount={daysSinceUpdate}
              />
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

          {/* ── Right: status rail ── */}
          <ProjectRail
            status={displayStatus}
            projectId={id}
            designerName={designerName}
            designerAvatarUrl={designerAvatarUrl}
            assignedAt={project.assigned_at}
            currentDesignerId={project.assigned_designer_id ?? null}
            designers={designers}
            isTerminal={isTerminal}
            billingStatus={project.billing_status}
            fileNavItems={[
              { label: "Intake Files", count: intakeFiles.length,  targetId: "section-intake" },
              { label: "SLD Sheets",   count: sldFiles.length,     targetId: "section-sld" },
              { label: "TCD Selected", count: selectedTCDs.length, targetId: "section-tcd" },
              { label: "TCP Sheets",   count: tcpFiles.length,     targetId: "section-tcp" },
              ...(packageVersionFiles.length > 0 ? [
                { label: "Packages", count: packageVersionFiles.length, targetId: "section-generated" },
              ] : []),
            ]}
            activity={activity}
            notes={notes}
            revalidatePath={`/admin/projects/${id}`}
            currentUserId={adminUserId}
            currentUserRole={currentUserRole}
            unreadCount={adminUnreadCount}
            setupReadiness={isEarlySetup ? {
              hasAuthority,
              hasActiveTemplate,
              missingBlueprintSections,
              requiresApplicationForm: effectiveRequiresApplication,
              hasApplicationFormTemplate,
              hasSld: sldFiles.length > 0,
              hasTcd: selectedTCDs.length > 0,
              hasDesigner,
            } : null}
          />
        </div>
      </div>
    </div>
  );
}
