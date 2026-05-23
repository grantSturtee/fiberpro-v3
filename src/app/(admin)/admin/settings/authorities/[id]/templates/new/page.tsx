import type { Metadata } from "next";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddAuthorityTemplateForm } from "@/components/admin/settings/AddAuthorityTemplateForm";
import { createAuthorityDocTemplate } from "@/app/(admin)/admin/settings/authorities/[id]/templates/actions";

export const metadata: Metadata = { title: "Add Document Template" };

export default async function NewAuthorityTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: authority } = await supabase
    .from("authority_profiles")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!authority) notFound();

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/authorities" label="Authorities" noMargin />
          <SettingsBackButton href={`/admin/settings/authorities/${id}/templates`} label="Templates" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Add Document Template</h1>
        <p className="mt-0.5 text-sm text-muted">
          Upload a flat PDF form for <span className="font-medium text-ink">{authority.name}</span>.
          After upload, use the overlay editor to map project fields to coordinates on the form.
        </p>
      </div>

      <div
        className="bg-card rounded-xl px-7 py-6"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <AddAuthorityTemplateForm
          authorityId={id}
          action={createAuthorityDocTemplate}
        />
      </div>

      <div className="text-xs text-muted space-y-1 px-1">
        <p>
          <span className="font-medium text-dim">Storage:</span>{" "}
          PDF is uploaded to <code className="bg-surface px-1 rounded">authority-documents</code> at{" "}
          <code className="bg-surface px-1 rounded">{id}/&lt;timestamp&gt;_&lt;filename&gt;.pdf</code>
        </p>
        <p>
          <span className="font-medium text-dim">Next step:</span>{" "}
          After upload, click <span className="font-medium text-ink">Configure Overlay</span> on the new template
          to place fields and save coordinate mappings.
        </p>
      </div>
    </div>
  );
}
