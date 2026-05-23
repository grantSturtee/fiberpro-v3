import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { FontLibraryClient } from "./FontLibraryClient";
import type { TemplateFont } from "@/lib/actions/templateFonts";

export const metadata: Metadata = { title: "Font Library" };

export default async function FontLibraryPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("page_template_fonts")
    .select("id, display_name, storage_path, original_filename, mime_type, file_ext, is_active, created_at")
    .eq("is_active", true)
    .order("display_name");

  const fonts = (data ?? []) as TemplateFont[];

  return (
    <div className="p-8 space-y-6 max-w-2xl mx-auto">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/page-templates" label="Page Templates" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Font Library</h1>
        <p className="mt-0.5 text-sm text-muted">
          Upload custom TTF or OTF fonts for use in page template text overlays. Fonts are shared across all templates.
        </p>
      </div>

      <SectionCard title="Font Library">
        <FontLibraryClient initialFonts={fonts} />
      </SectionCard>
    </div>
  );
}
