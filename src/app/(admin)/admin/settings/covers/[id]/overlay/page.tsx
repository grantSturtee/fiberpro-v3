import type { Metadata } from "next";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { notFound } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { CoverOverlayEditorClient } from "@/components/admin/settings/CoverOverlayEditorClient";
import { saveCoverOverlayMappings, replaceCoverPdf } from "./actions";
import type { OverlayMappings } from "./actions";

export const metadata: Metadata = { title: "Cover Overlay Editor" };

type PageDimensions = { width: number; height: number };

async function getPdfPageDimensions(storagePath: string): Promise<PageDimensions[]> {
  try {
    const service = createServiceClient();
    const { data: signed } = await service.storage
      .from("cover-templates")
      .createSignedUrl(storagePath, 120);
    if (!signed?.signedUrl) return [{ width: 612, height: 792 }];

    const res = await fetch(signed.signedUrl);
    if (!res.ok) return [{ width: 612, height: 792 }];

    const bytes = await res.arrayBuffer();
    const doc   = await PDFDocument.load(bytes);
    return doc.getPages().map((p) => {
      const { width, height } = p.getSize();
      return { width: Math.round(width), height: Math.round(height) };
    });
  } catch {
    return [{ width: 612, height: 792 }];
  }
}

export default async function CoverOverlayEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: template }, { data: liveVersion }] = await Promise.all([
    supabase
      .from("cover_sheet_templates")
      .select("id, name, storage_path, field_mappings")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("cover_template_versions")
      .select("id, storage_path, field_mappings")
      .eq("cover_template_id", id)
      .eq("is_live", true)
      .maybeSingle(),
  ]);

  if (!template) notFound();

  // Field mappings come from the live version (falls back to template for
  // templates that predate per-version field_mappings).
  const rawMappings =
    (liveVersion?.field_mappings as OverlayMappings | null) ??
    (template.field_mappings as OverlayMappings | null);

  const initialMappings: OverlayMappings = rawMappings ?? {
    mode: "overlay",
    fontSize: 9,
    fields: [],
  };

  // PDF path comes from the live version when available, otherwise from the
  // template record (backward compat for existing data).
  const pdfPath = liveVersion?.storage_path ?? template.storage_path ?? null;

  const pages = pdfPath
    ? await getPdfPageDimensions(pdfPath)
    : [{ width: 612, height: 792 }];

  return (
    <div className="p-6 space-y-4 max-w-[1300px] mx-auto">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/covers" label="Cover Templates" noMargin />
          <SettingsBackButton href={`/admin/settings/covers/${id}/edit`} label={template.name} noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Cover Overlay Editor</h1>
        <p className="mt-0.5 text-sm text-muted">{template.name}</p>
        {liveVersion && (
          <p className="mt-1 text-xs text-muted">
            Editing live version — field positions saved here apply when generating packages.
          </p>
        )}
      </div>

      <CoverOverlayEditorClient
        templateId={id}
        pdfUrl={`/api/cover-templates/${id}/pdf`}
        fileUrl={pdfPath}
        pages={pages}
        initialMappings={initialMappings}
        saveAction={saveCoverOverlayMappings}
        replaceAction={replaceCoverPdf}
      />
    </div>
  );
}
