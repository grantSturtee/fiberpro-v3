import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { PricingForm } from "@/components/admin/settings/PricingForm";
import { getPricingRule } from "@/lib/queries/pricing";

export const metadata: Metadata = { title: "Edit Pricing Rule" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminPricingEditPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const rule = await getPricingRule(supabase, id);
  if (!rule) notFound();

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <Link href="/admin/settings/pricing" className="hover:text-primary transition-colors">Pricing Rules</Link>
          <span>/</span>
          <span className="text-ink">Edit</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Edit Pricing Rule</h1>
        <p className="mt-0.5 text-sm text-muted">{rule.name}</p>
      </div>

      <SectionCard>
        <PricingForm item={rule} cancelHref="/admin/settings/pricing" />
      </SectionCard>
    </div>
  );
}
