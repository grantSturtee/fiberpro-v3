import type { Metadata } from "next";
import { AuthorityForm } from "@/components/admin/settings/AuthorityForm";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { createAuthority } from "@/app/(admin)/admin/settings/authorities/actions";

export const metadata: Metadata = { title: "New Authority" };

export default function NewAuthorityPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          <SettingsBackButton href="/admin/settings" label="Settings" noMargin />
          <SettingsBackButton href="/admin/settings/authorities" label="Authorities" noMargin />
        </div>
        <h1 className="text-xl font-semibold text-ink">Add Permitting Authority</h1>
        <p className="mt-0.5 text-sm text-muted">
          Configure requirements and contact info for a new permitting authority.
        </p>
      </div>

      <div
        className="bg-card rounded-xl px-7 py-6"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <AuthorityForm action={createAuthority} submitLabel="Create Authority" />
      </div>
    </div>
  );
}
