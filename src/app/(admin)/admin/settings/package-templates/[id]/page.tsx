import type { Metadata } from "next";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlueprintRecipeForm } from "./SlotsForm";
import { ActiveToggleButton } from "./ActiveToggleButton";
import { DeleteBlueprintButton } from "./DeleteBlueprintButton";
import {
  getBlueprintMissingRequired,
  getBlueprintMissingAuthorityDocs,
  type AuthorityRequirements,
} from "../blueprintCompleteness";

export const metadata: Metadata = { title: "Blueprint" };

// ── Types ─────────────────────────────────────────────────────────────────────

type BlueprintStatus = "draft" | "active" | "inactive";

type AuthorityProfile = {
  id: string;
  name: string;
  requires_application:   boolean | null;
  requires_certification: boolean | null;
  requires_coi:           boolean | null;
};

type PageTemplate = { id: string; name: string; template_type: string };

type BlueprintDetail = {
  id: string;
  description: string | null;
  work_type: string | null;
  status: BlueprintStatus;
  created_at: string;
  updated_at: string;
  authority_profile_id: string;
  cover_page_template_id: string | null;
  app_page_template_id: string | null;
  cert_page_template_id: string | null;
  tcp_wrapper_id: string | null;
  tcd_wrapper_id: string | null;
  sld_wrapper_id: string | null;
  coi_template_id: string | null;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlueprintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: raw, error: bpError } = await supabase
    .from("package_blueprints")
    .select(
      "id, description, work_type, status, created_at, updated_at, " +
      "authority_profile_id, cover_page_template_id, " +
      "app_page_template_id, cert_page_template_id, " +
      "tcp_wrapper_id, tcd_wrapper_id, sld_wrapper_id, coi_template_id"
    )
    .eq("id", id)
    .maybeSingle();

  // Distinguish a genuine query failure from a missing row.
  // Throwing here produces a 500 with a visible error rather than a silent 404.
  if (bpError) throw new Error(bpError.message);
  if (!raw) notFound();

  const bp = raw as unknown as BlueprintDetail;

  // Fetch authority separately so a deleted authority never filters out the blueprint.
  const { data: authorityData } = await supabase
    .from("authority_profiles")
    .select(
      "id, name, requires_application, requires_certification, requires_coi"
    )
    .eq("id", bp.authority_profile_id)
    .maybeSingle();
  const authority = authorityData as AuthorityProfile | null;

  const authorityRequirements: AuthorityRequirements | null = authority
    ? {
        requires_application:   authority.requires_application,
        requires_certification: authority.requires_certification,
        requires_coi:           authority.requires_coi,
      }
    : null;

  const missingRequired = [
    ...getBlueprintMissingRequired(bp as unknown as Record<string, unknown>),
    ...getBlueprintMissingAuthorityDocs(
      bp as unknown as Record<string, unknown>,
      authorityRequirements
    ),
  ];

  const { data: pageTemplateData } = await supabase
    .from("page_templates")
    .select("id, name, template_type")
    .eq("is_active", true)
    .order("name");

  const allPageTemplates = (pageTemplateData ?? []) as unknown as PageTemplate[];
  const coverOptions   = allPageTemplates.filter((t) => t.template_type === "cover");
  const tcpOptions     = allPageTemplates.filter((t) => t.template_type === "tcp_wrapper");
  const tcdOptions     = allPageTemplates.filter((t) => t.template_type === "tcd_wrapper");
  const sldOptions     = allPageTemplates.filter((t) => t.template_type === "sld_wrapper");
  const appOptions     = allPageTemplates.filter((t) => t.template_type === "application_form");
  const certOptions    = allPageTemplates.filter((t) => t.template_type === "certification_form");
  const coiOptions     = allPageTemplates.filter((t) => t.template_type === "coi");

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/package-templates" label="Package Templates" noMargin />
        </div>

        {/* Title + actions */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-ink">
                {authority?.name ?? "Blueprint"}
              </h1>
              <StatusBadge status={bp.status} />
            </div>
            {bp.description && (
              <p className="mt-1 text-sm text-muted">{bp.description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <ActiveToggleButton
              blueprintId={bp.id}
              currentStatus={bp.status}
              missingRequired={missingRequired}
            />
            <DeleteBlueprintButton blueprintId={bp.id} />
          </div>
        </div>

      </div>

      <BlueprintRecipeForm
        blueprintId={bp.id}
        description={bp.description}
        workType={bp.work_type}
        currentStatus={bp.status}
        coverPageTemplateId={bp.cover_page_template_id}
        appPageTemplateId={bp.app_page_template_id}
        certPageTemplateId={bp.cert_page_template_id}
        tcpWrapperId={bp.tcp_wrapper_id}
        tcdWrapperId={bp.tcd_wrapper_id}
        sldWrapperId={bp.sld_wrapper_id}
        coiTemplateId={bp.coi_template_id}
        coverOptions={coverOptions}
        applicationOptions={appOptions}
        certificationOptions={certOptions}
        tcpOptions={tcpOptions}
        tcdOptions={tcdOptions}
        sldOptions={sldOptions}
        coiOptions={coiOptions}
        authorityRequiresApp={!!authority?.requires_application}
        authorityRequiresCert={!!authority?.requires_certification}
        authorityRequiresCoi={!!authority?.requires_coi}
      />

    </div>
  );
}

// ── Status + work type badges ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: BlueprintStatus }) {
  if (status === "active") {
    return (
      <span className="text-[10px] font-semibold bg-green-50 text-green-700 rounded px-1.5 py-0.5">
        Active
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
        Draft
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
      Inactive
    </span>
  );
}


