import { CompanyHeader } from "@/components/company/CompanyHeader";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser, getCompany } from "@/lib/queries/projects";

// Company layout: polished client-facing shell.
// Top navigation instead of sidebar — cleaner external portal feel.
// Fetches company name once here so the header can display it without
// a separate client-side fetch.

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Best-effort company name fetch — if it fails, header degrades gracefully.
  let companyName: string | undefined;
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const companyId = await getCompanyIdForUser(supabase, userData.user.id);
      if (companyId) {
        const company = await getCompany(supabase, companyId);
        companyName = company?.name ?? undefined;
      }
    }
  } catch {
    // Non-fatal — header renders without company name
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      <CompanyHeader companyName={companyName} />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
