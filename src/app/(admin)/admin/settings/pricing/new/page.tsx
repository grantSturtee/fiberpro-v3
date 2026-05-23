import type { Metadata } from "next";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { PricingForm } from "@/components/admin/settings/PricingForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New Pricing Rule" };

export default async function AdminPricingNewPage() {
  const supabase = await createClient();
  const { data: companyData } = await supabase
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  const companies = (companyData ?? []) as Array<{ id: string; name: string }>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/pricing" label="Pricing Rules" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Add Pricing Rule</h1>
        <p className="mt-0.5 text-sm text-muted">
          Define fee structure and multipliers for a scope. Leave scope fields blank for a global fallback.
        </p>
      </div>

      <SectionCard>
        <PricingForm cancelHref="/admin/settings/pricing" companies={companies} />
      </SectionCard>
    </div>
  );
}
