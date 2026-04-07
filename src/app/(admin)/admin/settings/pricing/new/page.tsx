import type { Metadata } from "next";
import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";
import { PricingForm } from "@/components/admin/settings/PricingForm";

export const metadata: Metadata = { title: "New Pricing Rule" };

export default function AdminPricingNewPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <Link href="/admin/settings/pricing" className="hover:text-primary transition-colors">Pricing Rules</Link>
          <span>/</span>
          <span className="text-ink">New</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Add Pricing Rule</h1>
        <p className="mt-0.5 text-sm text-muted">
          Define fee structure and multipliers for a scope. Leave scope fields blank for a global fallback.
        </p>
      </div>

      <SectionCard>
        <PricingForm cancelHref="/admin/settings/pricing" />
      </SectionCard>
    </div>
  );
}
