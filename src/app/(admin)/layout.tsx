import { AdminSidebar } from "@/components/admin/AdminSidebar";

// Admin layout: persistent sidebar + scrollable main area.
// Sidebar handles its own navigation state (client component).
// TODO: Add middleware-based role guard — admin/designer only.

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
