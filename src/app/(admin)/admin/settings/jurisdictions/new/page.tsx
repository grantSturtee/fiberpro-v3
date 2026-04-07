import type { Metadata } from "next";
import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";
import { JurisdictionForm } from "@/components/admin/settings/JurisdictionForm";

export const metadata: Metadata = { title: "New Jurisdiction" };

export default function AdminJurisdictionNewPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <Link href="/admin/settings/jurisdictions" className="hover:text-primary transition-colors">Jurisdictions</Link>
          <span>/</span>
          <span className="text-ink">New</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Add Jurisdiction</h1>
        <p className="mt-0.5 text-sm text-muted">
          Configure submission requirements for a state, county, or municipal authority.
        </p>
      </div>

      <SectionCard>
        <JurisdictionForm cancelHref="/admin/settings/jurisdictions" />
      </SectionCard>
    </div>
  );
}
