// Package composition facts — single source of truth for the strings/booleans
// rendered on the admin AND designer Package tabs (Issue 3 Phase A/B).
//
// Why this file exists:
//   The admin route loads blueprint slot data, authority profile, and active
//   blueprint metadata via its session (admin) client and inlines the rendered
//   strings. The designer route was a stub — RLS blocks designer SELECT on
//   package_blueprints / authority_profiles / page_templates, so the previous
//   designer Package tab hardcoded "From authority template" and showed only
//   raw file counts. That meant the two views disagreed on the same project.
//
// Approach:
//   1. `buildPackageCompositionFacts` is a pure function (no DB) that turns
//      already-resolved inputs into the exact strings/booleans both views
//      should render. This is the format contract.
//   2. `getDesignerPackageCompositionFacts` resolves the inputs the designer
//      route does not have (because of RLS). It uses createServiceClient()
//      INTERNALLY for blueprint / authority lookups and returns ONLY the
//      denormalized facts shape — never raw blueprint/authority/template rows.
//
// Admin behavior is intentionally untouched. Admin already has all the inputs
// in scope; if/when admin adopts this builder, the strings will not drift.
// Until then a comment in the admin Composition card points at this file so a
// reviewer notices when one side is changed without the other.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  buildPageManifest,
  formatPageRange,
  type ManifestFileRef,
  type ManifestTcdRef,
} from "@/lib/utils/packageAssembly";

// ── Public types ──────────────────────────────────────────────────────────────

export type PackageCompositionRow = {
  label: string;       // "Cover Sheet" | "TCP Sheets" | "TCD Sheets" | "SLD Sheets"
  met: boolean;        // green check vs grey dot
  detail: string;      // right-aligned status string ("page 1 of 9", "No sheets uploaded", …)
};

export type PackageActiveTemplate = {
  description: string | null;   // blueprint description (e.g. "NJDOT Standard")
  workType: string | null;      // optional work type
  isAuthorityDefault: boolean;  // true when project has no override and authority has an active blueprint
  isOverride: boolean;          // true when project.blueprint_id is set
};

export type PackageCompositionFacts = {
  // Header
  activeTemplate: PackageActiveTemplate | null;
  hasBlueprint: boolean;
  coverTemplateConfigured: boolean;

  // Composition rows
  coverRow: PackageCompositionRow;
  tcpRow:   PackageCompositionRow;
  tcdRow:   PackageCompositionRow;
  sldRow:   PackageCompositionRow;

  // Readiness summary
  totalPages: number;
  sectionCounts: { cover: number; tcp: number; tcd: number; sld: number };
  missingItems: string[];
  isReady: boolean;
};

// Shape consumed by the pure builder. Callers resolve these themselves.
export type BuildPackageCompositionFactsInput = {
  tcpFiles:      ManifestFileRef[];
  tcdSelections: ManifestTcdRef[];
  sldFiles:      ManifestFileRef[];

  hasBlueprint: boolean;
  coverTemplateConfigured: boolean;
  activeTemplate: PackageActiveTemplate | null;

  prereqs: {
    sld:      boolean;
    tcd:      boolean;
    tcp:      boolean;
    approved: boolean;
    template: boolean;
  };

  requiresApplication:   boolean;
  requiresCertification: boolean;
  requiresCoi:           boolean;
  hasApplicationFile:    boolean;
  hasCertificationFile:  boolean;
  hasCOIFile:            boolean;
};

// ── Pure builder ──────────────────────────────────────────────────────────────
//
// Mirrors the admin Composition card strings byte-for-byte. Update both at
// once: this builder AND the admin Composition JSX
// (src/app/(admin)/admin/projects/[id]/page.tsx, "Cover Sheet" / "TCP Sheets"
// / "TCD Sheets" / "SLD Sheets" rows).

export function buildPackageCompositionFacts(
  input: BuildPackageCompositionFactsInput,
): PackageCompositionFacts {
  const manifest = buildPageManifest(
    input.tcpFiles,
    input.tcdSelections,
    input.sldFiles,
  );

  const coverDetail = input.coverTemplateConfigured
    ? `Cover template configured · ${formatPageRange(manifest.sectionRanges.cover, manifest.totalPages)}`
    : input.hasBlueprint
    ? "No cover template assigned to this blueprint"
    : "No blueprint selected — cover template not available";

  const tcpCount = input.tcpFiles.length;
  const tcdCount = input.tcdSelections.length;
  const sldCount = input.sldFiles.length;

  const tcpDetail = tcpCount > 0
    ? `${tcpCount} sheet${tcpCount !== 1 ? "s" : ""} · ${formatPageRange(manifest.sectionRanges.tcp, manifest.totalPages)}`
    : "No sheets uploaded";

  const tcdDetail = tcdCount > 0
    ? `${tcdCount} selected · ${formatPageRange(manifest.sectionRanges.tcd, manifest.totalPages)}`
    : "No sheets selected";

  const sldDetail = sldCount > 0
    ? `${sldCount} drawing${sldCount !== 1 ? "s" : ""} · ${formatPageRange(manifest.sectionRanges.sld, manifest.totalPages)}`
    : "No drawings uploaded";

  const missingItems = [
    !input.prereqs.sld      ? "SLD Sheets"        : null,
    !input.prereqs.tcd      ? "TCD Selection"     : null,
    !input.prereqs.tcp      ? "TCP Sheets"        : null,
    !input.prereqs.approved ? "Design Approval"   : null,
    !input.prereqs.template ? "Authority"         : null,
    input.requiresApplication   && !input.hasApplicationFile   ? "Application Form"   : null,
    input.requiresCertification && !input.hasCertificationFile ? "Certification Form" : null,
    input.requiresCoi           && !input.hasCOIFile           ? "COI"                : null,
  ].filter((s): s is string => s !== null);

  return {
    activeTemplate: input.activeTemplate,
    hasBlueprint:   input.hasBlueprint,
    coverTemplateConfigured: input.coverTemplateConfigured,

    coverRow: { label: "Cover Sheet", met: input.coverTemplateConfigured, detail: coverDetail },
    tcpRow:   { label: "TCP Sheets",  met: input.prereqs.tcp,             detail: tcpDetail },
    tcdRow:   { label: "TCD Sheets",  met: input.prereqs.tcd,             detail: tcdDetail },
    sldRow:   { label: "SLD Sheets",  met: input.prereqs.sld,             detail: sldDetail },

    totalPages:    manifest.totalPages,
    sectionCounts: manifest.sectionCounts,
    missingItems,
    isReady:       missingItems.length === 0,
  };
}

// ── Designer-side loader ──────────────────────────────────────────────────────
//
// Resolves the facts needed by the designer Package tab without exposing
// blueprint / authority / template rows.
//
// `supabase` is the designer's SESSION client (RLS-restricted). It is used
// only to confirm separate-output file presence — RLS already permits the
// assigned designer to read project_files for the project.
//
// `createServiceClient()` is called INTERNALLY for the three RLS-blocked
// tables (jurisdictions [for authority resolution], authority_profiles,
// package_blueprints). Only denormalized booleans + display strings are
// returned. No row pointers, no template ids, no policy bypass leaks.

const APPROVED_GENERATION_BLOCKING_STATUSES: ReadonlySet<string> = new Set([
  "intake_review",
  "waiting_on_client",
  "ready_for_assignment",
  "assigned",
  "in_design",
  "waiting_for_admin_review",
  "revisions_required",
  "cancelled",
]);

export type DesignerPackageCompositionInput = {
  project: {
    id: string;
    status: string;
    blueprint_id: string | null;
    authority_id: string | null;
    jurisdiction_id: string | null;
    pe_required: boolean | null;
    req_application_override:   boolean | null;
    req_certification_override: boolean | null;
    req_coi_override:           boolean | null;
  };
  // Already loaded by the route (RLS-permitted, in correct sort order).
  tcpFiles:      ManifestFileRef[];
  tcdSelections: ManifestTcdRef[];
  sldFiles:      ManifestFileRef[];
};

export async function getDesignerPackageCompositionFacts(
  supabase: SupabaseClient,
  input: DesignerPackageCompositionInput,
): Promise<PackageCompositionFacts> {
  const service = createServiceClient();

  // 1) Resolve effective authority — project.authority_id wins, else fall back
  //    to the jurisdiction's linked authority_profile (mirrors admin).
  let effectiveAuthorityId = input.project.authority_id;
  if (!effectiveAuthorityId && input.project.jurisdiction_id) {
    const { data: jurAuth } = await service
      .from("jurisdictions")
      .select("authority_profile_id")
      .eq("id", input.project.jurisdiction_id)
      .maybeSingle();
    effectiveAuthorityId =
      (jurAuth as { authority_profile_id: string | null } | null)?.authority_profile_id ?? null;
  }
  const hasAuthority = effectiveAuthorityId !== null;

  // 2) Authority required-output flags + authority's active blueprint id.
  type AuthRequires = {
    requires_application:   boolean | null;
    requires_certification: boolean | null;
    requires_coi:           boolean | null;
  };
  let authRequires: AuthRequires | null = null;
  let authorityActiveBlueprintId: string | null = null;

  if (effectiveAuthorityId) {
    const [{ data: authRow }, { data: authBp }] = await Promise.all([
      service
        .from("authority_profiles")
        .select("requires_application, requires_certification, requires_coi")
        .eq("id", effectiveAuthorityId)
        .maybeSingle(),
      service
        .from("package_blueprints")
        .select("id")
        .eq("authority_profile_id", effectiveAuthorityId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    authRequires = (authRow as AuthRequires | null) ?? null;
    authorityActiveBlueprintId = (authBp as { id: string } | null)?.id ?? null;
  }

  // 3) Effective blueprint = project override → authority active.
  const effectiveBlueprintId = input.project.blueprint_id ?? authorityActiveBlueprintId;
  type BlueprintRow = {
    description: string | null;
    work_type: string | null;
    cover_page_template_id: string | null;
  };
  let blueprint: BlueprintRow | null = null;
  if (effectiveBlueprintId) {
    const { data } = await service
      .from("package_blueprints")
      .select("description, work_type, cover_page_template_id")
      .eq("id", effectiveBlueprintId)
      .maybeSingle();
    blueprint = (data as BlueprintRow | null) ?? null;
  }

  // 4) Tri-state requirement resolution (project override beats authority default).
  const requiresApplication =
    input.project.req_application_override   ?? authRequires?.requires_application   ?? false;
  const requiresCertification =
    input.project.req_certification_override ?? authRequires?.requires_certification ?? false;
  const requiresCoi =
    input.project.req_coi_override           ?? authRequires?.requires_coi           ?? false;

  // 5) Separate-output file presence — designer can read project_files for
  //    assigned projects via existing RLS, so use the passed session client.
  const { data: outputFilesData } = await supabase
    .from("project_files")
    .select("file_category")
    .eq("project_id", input.project.id)
    .in("file_category", ["application_form", "certification_form", "coi"]);
  const outputCategories = new Set(
    (outputFilesData as Array<{ file_category: string }> | null ?? []).map((r) => r.file_category),
  );
  const hasApplicationFile   = outputCategories.has("application_form");
  const hasCertificationFile = outputCategories.has("certification_form");
  const hasCOIFile           = outputCategories.has("coi");

  // 6) Approved (= not in any pre-generation-blocking status).
  const approved = !APPROVED_GENERATION_BLOCKING_STATUSES.has(input.project.status);

  return buildPackageCompositionFacts({
    tcpFiles:      input.tcpFiles,
    tcdSelections: input.tcdSelections,
    sldFiles:      input.sldFiles,

    hasBlueprint: !!effectiveBlueprintId,
    coverTemplateConfigured: !!blueprint?.cover_page_template_id,
    activeTemplate: blueprint
      ? {
          description: blueprint.description,
          workType:    blueprint.work_type,
          isAuthorityDefault: !input.project.blueprint_id && !!authorityActiveBlueprintId,
          isOverride:         !!input.project.blueprint_id,
        }
      : null,

    prereqs: {
      sld:      input.sldFiles.length > 0,
      tcd:      input.tcdSelections.length > 0,
      tcp:      input.tcpFiles.length > 0,
      approved,
      template: hasAuthority,
    },

    requiresApplication:   !!requiresApplication,
    requiresCertification: !!requiresCertification,
    requiresCoi:           !!requiresCoi,
    hasApplicationFile,
    hasCertificationFile,
    hasCOIFile,
  });
}
