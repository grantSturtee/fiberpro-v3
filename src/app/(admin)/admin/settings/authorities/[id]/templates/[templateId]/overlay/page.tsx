import type { Metadata } from "next";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { notFound } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { OverlayEditorClient } from "@/components/admin/settings/OverlayEditorClient";
import { saveOverlayMappings, replacePdf } from "./actions";
import type { OverlayMappings } from "./actions";

export const metadata: Metadata = { title: "Overlay Editor" };

type PageDimensions = { width: number; height: number };

async function getPdfPageDimensions(fileUrl: string): Promise<PageDimensions[]> {
  try {
    const service = createServiceClient();
    const { data: signed } = await service.storage
      .from("authority-documents")
      .createSignedUrl(fileUrl, 120);
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

export default async function OverlayEditorPage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id, templateId } = await params;
  const supabase = await createClient();

  const [{ data: authority }, { data: template }] = await Promise.all([
    supabase
      .from("authority_profiles")
      .select("id, name")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("authority_document_templates")
      .select("id, type, file_url, field_mappings")
      .eq("id", templateId)
      .eq("authority_id", id)
      .maybeSingle(),
  ]);

  if (!authority || !template) notFound();

  const rawMappings = template.field_mappings as OverlayMappings | null;

  // Only expose overlay editor for overlay-mode templates (or unconfigured ones
  // that will be initialized as overlay)
  if (rawMappings && rawMappings.mode !== "overlay") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <p className="text-sm text-muted">
          This template uses AcroForm mode — the overlay editor only works with
          flat PDF templates (mode: &quot;overlay&quot;). Edit{" "}
          <code className="bg-surface px-1 rounded">field_mappings</code>{" "}
          directly in Supabase.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/authorities" label="Authorities" noMargin />
          <SettingsBackButton href={`/admin/settings/authorities/${id}/templates`} label="Templates" noMargin />
        </div>
      </div>
    );
  }

  const initialMappings: OverlayMappings = rawMappings ?? {
    mode: "overlay",
    fontSize: 9,
    fields: [],
  };

  // Attempt to read page dimensions from the stored PDF; falls back to defaults
  // if the file is missing — the editor still works, just without a live preview.
  const pages = template.file_url
    ? await getPdfPageDimensions(template.file_url)
    : [{ width: 612, height: 792 }];

  const TYPE_LABELS: Record<string, string> = {
    application:   "Application Form",
    certification: "Certification Form",
  };

  return (
    <div className="p-6 space-y-4 max-w-[1300px] mx-auto">
      {/* Header */}
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/authorities" label="Authorities" noMargin />
          <SettingsBackButton href={`/admin/settings/authorities/${id}/templates`} label="Templates" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Overlay Editor</h1>
        <p className="mt-0.5 text-sm text-muted">
          {authority.name} — {TYPE_LABELS[template.type] ?? template.type}
        </p>
      </div>

      <OverlayEditorClient
        templateId={templateId}
        authorityId={id}
        pdfUrl={`/api/authority-templates/${templateId}/pdf`}
        fileUrl={template.file_url ?? null}
        pages={pages}
        initialMappings={initialMappings}
        saveAction={saveOverlayMappings}
        replaceAction={replacePdf}
      />
    </div>
  );
}
