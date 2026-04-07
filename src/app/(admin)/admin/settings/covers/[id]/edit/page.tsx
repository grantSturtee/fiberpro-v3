import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { CoverEditForm } from "@/components/admin/settings/CoverEditForm";

export const metadata: Metadata = { title: "Edit Cover Template" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminCoverEditPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("cover_sheet_templates")
    .select("id, name, authority_type, county, state, work_type, notes, storage_path, is_default, sort_order")
    .eq("id", id)
    .single();

  if (!item) notFound();

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <Link href="/admin/settings/covers" className="hover:text-primary transition-colors">Cover Templates</Link>
          <span>/</span>
          <span className="text-ink">Edit</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit Template</h1>
        <p className="mt-0.5 text-sm text-muted">{item.name}</p>
      </div>

      <SectionCard>
        <CoverEditForm item={item} />
      </SectionCard>
    </div>
  );
}
