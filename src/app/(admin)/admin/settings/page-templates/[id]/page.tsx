import type { Metadata } from "next";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SectionCard } from "@/components/ui/SectionCard";
import { EditForm } from "./EditForm";
import { FieldMappingsForm } from "./FieldMappingsForm";
import { TemplateDiagnosticsPanel } from "./TemplateDiagnosticsPanel";
import { PAGE_TEMPLATES_BUCKET } from "@/lib/constants/files";
import type { TemplateAsset } from "@/lib/actions/templateAssets";
import type { TemplateFont } from "@/lib/actions/templateFonts";
import { validatePageTemplateMappings } from "@/lib/templates/validatePageTemplate";

export const metadata: Metadata = { title: "Edit Template" };

const TYPE_LABELS: Record<string, string> = {
  cover:              "Cover",
  tcp_wrapper:        "TCP Wrapper",
  tcd_wrapper:        "TCD Wrapper",
  sld_wrapper:        "SLD Wrapper",
  application_form:   "Application Form",
  certification_form: "Certification Form",
  coi:                "COI",
};

const TYPE_TOKEN: Record<string, string> = {
  cover:              "bg-blue-50 text-blue-700",
  tcp_wrapper:        "bg-violet-50 text-violet-700",
  tcd_wrapper:        "bg-indigo-50 text-indigo-700",
  sld_wrapper:        "bg-cyan-50 text-cyan-700",
  application_form:   "bg-emerald-50 text-emerald-700",
  certification_form: "bg-amber-50 text-amber-700",
  coi:                "bg-rose-50 text-rose-700",
};

type PageTemplateRow = {
  id: string;
  name: string;
  template_type: string;
  storage_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  placement_box: Record<string, unknown> | null;
  field_mappings: Record<string, unknown> | null;
};

export default async function PageTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [templateResult, assetsResult, fontsResult] = await Promise.all([
    supabase
      .from("page_templates")
      .select("id, name, template_type, storage_path, is_active, created_at, updated_at, placement_box, field_mappings")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("page_template_assets")
      .select("id, name, storage_path, mime_type, created_at")
      .eq("page_template_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("page_template_fonts")
      .select("id, display_name, storage_path, original_filename, mime_type, file_ext, is_active, created_at")
      .eq("is_active", true)
      .order("display_name"),
  ]);

  if (templateResult.error) throw new Error(templateResult.error.message);
  if (!templateResult.data) notFound();

  const t = templateResult.data as unknown as PageTemplateRow;
  const initialAssets = (assetsResult.data ?? []) as TemplateAsset[];
  const fonts = (fontsResult.data ?? []) as TemplateFont[];

  const createdDate = new Date(t.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const pb = t.placement_box;
  const placementBox =
    pb &&
    typeof pb.x      === "number" &&
    typeof pb.y      === "number" &&
    typeof pb.width  === "number" &&
    typeof pb.height === "number"
      ? { x: pb.x, y: pb.y, width: pb.width, height: pb.height }
      : null;

  let pdfSignedUrl: string | null = null;
  if (t.storage_path) {
    try {
      const serviceClient = createServiceClient();
      const { data } = await serviceClient.storage
        .from(PAGE_TEMPLATES_BUCKET)
        .createSignedUrl(t.storage_path, 3600);
      pdfSignedUrl = data?.signedUrl ?? null;
    } catch {
      // Non-fatal: editor degrades gracefully with no preview
    }
  }

  const typeLabel  = TYPE_LABELS[t.template_type] ?? t.template_type;
  const tokenClass = TYPE_TOKEN[t.template_type]  ?? "bg-surface text-dim";

  const diagnostics = validatePageTemplateMappings({
    templateType:  t.template_type,
    storagePath:   t.storage_path,
    placementBox:  placementBox,
    fieldMappings: t.field_mappings,
    fonts,
    assets:        initialAssets,
    // pageDims intentionally omitted server-side; the editor does live off-page checks.
  });

  return (
    // "Tool mode" page width — this is an editor/tool page, not a standard
    // settings form. It uses near-full available width so the 3-column
    // workspace (palette · canvas · inspector) gets maximum room on wide
    // monitors, with responsive side padding as a comfort buffer.
    <div className="w-full max-w-none mx-auto py-8 px-4 sm:px-6 xl:px-8 space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/page-templates" label="Page Templates" noMargin />
        </div>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-ink">{t.name}</h1>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${tokenClass}`}
              >
                {typeLabel}
              </span>
              <span className="text-xs text-muted">Created {createdDate}</span>
            </div>
          </div>
        </div>
      </div>

      <SectionCard title="Template settings">
        <EditForm
          id={t.id}
          name={t.name}
          templateType={t.template_type}
          storagePath={t.storage_path}
          isActive={t.is_active}
          placementBox={placementBox}
        />
      </SectionCard>

      <SectionCard title="Diagnostics" description="Issues that could affect this template's behavior at package-generation time.">
        <TemplateDiagnosticsPanel issues={diagnostics} />
      </SectionCard>

      <SectionCard
        title="Field mappings"
        description="Click a field to start placing, then click on the PDF. Regions bind to runtime content sources. Saved independently from template settings."
        noPad
      >
        <FieldMappingsForm
          id={t.id}
          fieldMappings={t.field_mappings}
          pdfSignedUrl={pdfSignedUrl}
          initialAssets={initialAssets}
          fonts={fonts}
        />
      </SectionCard>
    </div>
  );
}
