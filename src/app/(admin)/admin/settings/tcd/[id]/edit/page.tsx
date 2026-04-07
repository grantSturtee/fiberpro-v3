import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
    .select("id, code, description, category, state, storage_path")
    .eq("id", id)
    .single();

  if (!item) notFound();

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <Link href="/admin/settings/tcd" className="hover:text-primary transition-colors">TCD Library</Link>
          <span>/</span>
          <span className="text-ink">Edit {item.code}</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit {item.code}</h1>
      </div>

      <SectionCard>
        <TcdEditForm item={item} />
      </SectionCard>
    </div>
  );
}
