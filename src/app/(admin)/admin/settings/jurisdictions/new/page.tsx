import type { Metadata } from "next";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { JurisdictionForm } from "@/components/admin/settings/JurisdictionForm";

export const metadata: Metadata = { title: "New Jurisdiction" };

export default function AdminJurisdictionNewPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/jurisdictions" label="Jurisdictions" noMargin />
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
