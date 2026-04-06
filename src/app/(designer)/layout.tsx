import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DesignerSidebar } from "@/components/designer/DesignerSidebar";

// Designer layout: persistent sidebar + scrollable content area.
// Fetches real user identity server-side to populate the sidebar.

export default async function DesignerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, role")
    .eq("id", userData.user.id)
    .single();

  const displayName = profile?.display_name || userData.user.email || "Designer";
  const role = profile?.role || "designer";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <DesignerSidebar user={{ displayName, role, initials }} />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
