import type { Metadata } from "next";
import Link from "next/link";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { DeleteAuthorityTemplateButton } from "@/components/admin/settings/DeleteAuthorityTemplateButton";
import { deleteAuthorityDocTemplate } from "@/app/(admin)/admin/settings/authorities/[id]/templates/actions";

export const metadata: Metadata = { title: "Document Templates" };

type Template = {
  id: string;
  type: string;
  file_url: string;
  field_mappings: { mode?: string; fields?: unknown[] } | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  application:   "Application Form",
  certification: "Certification Form",
};

/** Strip the timestamp prefix from a storage path basename for display. */
function displayFilename(fileUrl: string): string {
  const base = fileUrl.split("/").pop() ?? fileUrl;
  return base.replace(/^\d+_/, "");
}

export default async function AuthorityTemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: authority }, { data: templates }] = await Promise.all([
    supabase
      .from("authority_profiles")
      .select("id, name")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("authority_document_templates")
      .select("id, type, file_url, field_mappings, created_at")
      .eq("authority_id", id)
      .order("type"),
  ]);

  if (!authority) notFound();

  const rows = (templates ?? []) as unknown as Template[];

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
            <SettingsBackButton href="/admin/settings/authorities" label="Authorities" noMargin />
          </div>
          <h1 className="text-xl font-semibold text-ink">{authority.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Document templates — upload a flat PDF, then use the overlay editor to map project fields to it.
          </p>
        </div>
        <Link
          href={`/admin/settings/authorities/${id}/templates/new`}
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          + Add Template
        </Link>
      </div>

      {rows.length > 0 ? (
        <SectionCard noPad>
          <div className="divide-y divide-surface">
            {rows.map((t) => {
              const isOverlay      = t.field_mappings?.mode === "overlay";
              const isAcroForm     = t.field_mappings?.mode === "acroform";
              const isUnconfigured = t.field_mappings === null;
              const fieldCount     =
                isOverlay && Array.isArray(t.field_mappings?.fields)
                  ? t.field_mappings!.fields!.length
                  : null;
              // Overlay editor is accessible for unconfigured templates and overlay-mode templates.
              // AcroForm templates are edited directly in Supabase.
              const showOverlayAction = isOverlay || isUnconfigured;

              return (
                <div key={t.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">
                        {TYPE_LABELS[t.type] ?? t.type}
                      </span>
                      {isOverlay && (
                        <span className="text-[10px] font-semibold bg-primary-soft text-primary rounded px-1.5 py-0.5">
                          Overlay
                        </span>
                      )}
                      {isAcroForm && (
                        <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                          AcroForm
                        </span>
                      )}
                      {isUnconfigured && (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                          Not configured
                        </span>
                      )}
                      {fieldCount !== null && (
                        <span className="text-[10px] text-muted">
                          {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {displayFilename(t.file_url)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {showOverlayAction ? (
                      <Link
                        href={`/admin/settings/authorities/${id}/templates/${t.id}/overlay`}
                        title={isUnconfigured ? "Configure overlay" : "Edit overlay"}
                        className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary-soft transition-colors"
                      >
                        <PencilIcon />
                        <span className="sr-only">
                          {isUnconfigured ? "Configure overlay" : "Edit overlay"}
                        </span>
                      </Link>
                    ) : (
                      <span
                        title="AcroForm — edit field_mappings directly in Supabase"
                        className="p-2 text-faint cursor-default"
                      >
                        <PencilIcon />
                        <span className="sr-only">AcroForm — edit in Supabase</span>
                      </span>
                    )}
                    <DeleteAuthorityTemplateButton
                      templateId={t.id}
                      authorityId={id}
                      action={deleteAuthorityDocTemplate}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <div
          className="bg-card rounded-xl px-6 py-12 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">No document templates yet for this authority.</p>
          <Link
            href={`/admin/settings/authorities/${id}/templates/new`}
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Upload the first template →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" />
      <path d="M8 4l2 2" />
    </svg>
  );
}
