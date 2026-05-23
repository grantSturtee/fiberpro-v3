import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { PageTemplateCreateForm } from "./PageTemplateCreateForm";
import { TemplateList } from "./TemplateList";

export const metadata: Metadata = { title: "Page Templates" };

type PageTemplateRow = {
  id: string;
  name: string;
  template_type: string;
  storage_path: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function PageTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ archive_error?: string }>;
}) {
  const supabase = await createClient();
  const { archive_error: archiveError } = await searchParams;

  const { data } = await supabase
    .from("page_templates")
    .select("id, name, template_type, storage_path, is_active, created_at")
    .order("template_type")
    .order("name");

  const rows = (data ?? []) as PageTemplateRow[];

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <SettingsBackButton href="/admin/settings" label="Settings" />
        <h1 className="text-xl font-semibold text-ink">Page Templates</h1>
        <p className="mt-0.5 text-sm text-muted">
          Reusable templates for all permit package slots: cover, TCP, TCD, SLD, application form, certification form, and COI.
        </p>
      </div>

      {archiveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span className="font-semibold mr-1">Cannot archive template:</span>
          {archiveError}
        </div>
      )}

      {/* Font Library link */}
      <div>
        <Link
          href="/admin/settings/page-templates/fonts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <span>↗</span>
          Font Library
        </Link>
        <span className="text-xs text-muted ml-2">— manage custom fonts for text overlays</span>
      </div>

      {/* Template list with search + filter */}
      <TemplateList rows={rows} />

      {/* Create */}
      <SectionCard
        title="Add template"
        description="Create a new page template. PDF upload is optional — you can add the file later."
      >
        <PageTemplateCreateForm />
      </SectionCard>
    </div>
  );
}
