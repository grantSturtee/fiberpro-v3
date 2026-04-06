import { DesignerSidebar } from "@/components/designer/DesignerSidebar";

// Designer layout: focused, task-oriented.
// Sidebar is minimal — designer works projects, not settings.
// TODO: Add middleware-based role guard — designer only.

export default function DesignerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <DesignerSidebar />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
