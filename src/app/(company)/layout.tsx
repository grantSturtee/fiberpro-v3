import { CompanyHeader } from "@/components/company/CompanyHeader";

// Company layout: polished client-facing shell.
// Top navigation instead of sidebar — cleaner external portal feel.
// TODO: Add middleware-based role guard — company_admin/project_manager only.

export default function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      <CompanyHeader />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
