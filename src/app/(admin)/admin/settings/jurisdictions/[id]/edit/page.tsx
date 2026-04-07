import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { JurisdictionForm, type JurisdictionFormItem } from "@/components/admin/settings/JurisdictionForm";

export const metadata: Metadata = { title: "Edit Jurisdiction" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminJurisdictionEditPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("jurisdictions")
    .select(
      "id, state, county, township, authority_name, submission_method, submission_url, submission_email, " +
      "requires_coi, requires_pe_stamp, requires_traffic_control_plan, requires_cover_sheet, requires_application_form, " +
      "cover_sheet_template_id, application_fee, jurisdiction_fee, " +
      "requires_review_before_submission, allows_bulk_submission, avg_approval_days, notes"
    )
    .eq("id", id)
    .single();

  if (!item) notFound();

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <Link href="/admin/settings/jurisdictions" className="hover:text-primary transition-colors">Jurisdictions</Link>
          <span>/</span>
          <span className="text-ink">Edit</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit Jurisdiction</h1>
        <p className="mt-0.5 text-sm text-muted">{item.authority_name}</p>
      </div>

      <SectionCard>
        <JurisdictionForm
          item={item as JurisdictionFormItem}
          cancelHref="/admin/settings/jurisdictions"
        />
      </SectionCard>
    </div>
  );
}
