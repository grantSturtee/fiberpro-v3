import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { createClient } from "@/lib/supabase/server";
import { AuthorityForm, type AuthorityRow } from "@/components/admin/settings/AuthorityForm";
import { updateAuthority } from "@/app/(admin)/admin/settings/authorities/actions";

export const metadata: Metadata = { title: "Edit Authority" };

export default async function EditAuthorityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("authority_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const authority = data as AuthorityRow & { id: string };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/authorities" label="Authorities" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">{authority.name}</h1>
        <p className="mt-0.5 text-sm text-muted">Edit authority requirements and contact information.</p>
      </div>

      <div
        className="bg-card rounded-xl px-7 py-6"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <AuthorityForm
          action={updateAuthority}
          defaultValues={authority}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}
