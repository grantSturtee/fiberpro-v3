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

  // getClaims() reads JWT claims locally — no network round-trip, no token refresh.
  // getUser() triggers a Supabase Auth network call on every layout render, which causes
  // concurrent 409 token refresh conflicts under rapid navigation (@supabase/ssr 0.10+).
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect("/sign-in");

  const userId = claims.sub;

  // Core profile — display name and role only. Must never be broken by schema additions.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, role")
    .eq("id", userId)
    .single();

  // Avatar URL — separate query so a missing column cannot affect display name resolution.
  const { data: avatarData } = await supabase
    .from("user_profiles")
    .select("avatar_url")
    .eq("id", userId)
    .single();

  const metaDisplayName = (claims.user_metadata?.display_name as string | undefined)?.trim();
  const displayName =
    profile?.display_name?.trim() ||
    metaDisplayName ||
    claims.email ||
    "Designer";
  const role = profile?.role || "designer";
  // Convert stored path to a signed URL. Falls back to null (initials) if absent or signing fails.
  let avatarUrl: string | null = null;
  if (avatarData?.avatar_url) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(avatarData.avatar_url, 3600);
    avatarUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <DesignerSidebar user={{ displayName, role, avatarUrl }} />
      <main className="flex-1 overflow-y-auto overscroll-y-none min-w-0">
        {children}
      </main>
    </div>
  );
}
