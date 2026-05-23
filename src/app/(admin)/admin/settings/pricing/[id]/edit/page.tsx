import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { PricingForm } from "@/components/admin/settings/PricingForm";
import { getPricingRule } from "@/lib/queries/pricing";

export const metadata: Metadata = { title: "Edit Pricing Rule" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminPricingEditPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [rule, companyResult] = await Promise.all([
    getPricingRule(supabase, id),
    supabase
      .from("companies")
      .select("id, name")
      .is("archived_at", null)
      .order("name"),
  ]);
  if (!rule) notFound();

  const companies = (companyResult.data ?? []) as Array<{ id: string; name: string }>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/pricing" label="Pricing Rules" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit Pricing Rule</h1>
        <p className="mt-0.5 text-sm text-muted">{rule.name}</p>
      </div>

      <SectionCard>
        <PricingForm item={rule} cancelHref="/admin/settings/pricing" companies={companies} />
      </SectionCard>
    </div>
  );
}
