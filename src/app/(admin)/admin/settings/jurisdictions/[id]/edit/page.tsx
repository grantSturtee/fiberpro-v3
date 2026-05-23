import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
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
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/jurisdictions" label="Jurisdictions" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit Jurisdiction</h1>
        <p className="mt-0.5 text-sm text-muted">{(item as unknown as JurisdictionFormItem).authority_name}</p>
      </div>

      <SectionCard>
        <JurisdictionForm
          item={item as unknown as JurisdictionFormItem}
          cancelHref="/admin/settings/jurisdictions"
        />
      </SectionCard>
    </div>
  );
}
