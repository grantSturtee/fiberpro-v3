import type { Metadata } from "next";
import Link from "next/link";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { CoverEditForm } from "@/components/admin/settings/CoverEditForm";
import { CoverVersionsPanel } from "@/components/admin/settings/CoverVersionsPanel";
import type { CoverVersion } from "@/components/admin/settings/CoverVersionsPanel";

export const metadata: Metadata = { title: "Edit Cover Template" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminCoverEditPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: versionsRaw }] = await Promise.all([
    supabase
      .from("cover_sheet_templates")
      .select("id, name, authority_type, county, state, work_type, pe_required, sort_order, field_mappings")
      .eq("id", id)
      .single(),
    supabase
      .from("cover_template_versions")
      .select("id, filename, is_live, uploaded_at")
      .eq("cover_template_id", id)
      .order("uploaded_at", { ascending: false }),
  ]);

  if (!item) notFound();

  const versions = (versionsRaw ?? []) as CoverVersion[];
  const hasOverlay = !!(item.field_mappings as { mode?: string } | null)?.mode;
  const hasLiveVersion = versions.some((v) => v.is_live);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/covers" label="Cover Templates" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit Template</h1>
        <p className="mt-0.5 text-sm text-muted">{item.name}</p>
      </div>

      {/* Overlay editor shortcut */}
      <div
        className="rounded-xl px-5 py-4 flex items-center justify-between gap-4"
        style={{ background: "#f0f4ff", border: "1px solid #c7d7f7" }}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Field Mapping</p>
          <p className="text-xs text-muted mt-0.5">
            {hasOverlay
              ? "Overlay configured — click to edit field positions."
              : hasLiveVersion
              ? "Live PDF available — open the overlay editor to map fields."
              : "Upload a PDF version first, then map field positions."}
          </p>
        </div>
        <Link
          href={`/admin/settings/covers/${id}/overlay`}
          className={[
            "shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors",
            hasLiveVersion
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-surface text-dim border border-rule cursor-not-allowed pointer-events-none opacity-50",
          ].join(" ")}
          aria-disabled={!hasLiveVersion}
          tabIndex={hasLiveVersion ? undefined : -1}
        >
          {hasOverlay ? "Edit Overlay" : "Open Overlay Editor"}
        </Link>
      </div>

      {/* Match criteria + name */}
      <SectionCard>
        <CoverEditForm item={item} />
      </SectionCard>

      {/* PDF Versions */}
      <SectionCard title="PDF Versions">
        <CoverVersionsPanel templateId={id} initialVersions={versions} />
      </SectionCard>
    </div>
  );
}
