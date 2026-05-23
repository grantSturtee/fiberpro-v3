import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { TcdEditForm } from "@/components/admin/settings/TcdEditForm";

export const metadata: Metadata = { title: "Edit TCD Sheet" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminTcdEditPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("tcd_library")
    .select("id, code, description, state, storage_path")
    .eq("id", id)
    .single();

  if (!item) notFound();

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/tcd" label="TCD Library" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit {item.code}</h1>
      </div>

      <SectionCard>
        <TcdEditForm item={item} />
      </SectionCard>
    </div>
  );
}
