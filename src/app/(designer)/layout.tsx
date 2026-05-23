import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/ui/Logo";
import { UserAvatar } from "@/components/shared/UserAvatar";

// Designer layout: fixed top nav + full-width scrollable content.
// Fetches real user identity server-side to populate the nav bar.

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
    <div className="min-h-screen bg-surface">

      {/* Top navigation bar — fixed, never scrolls */}
      <header
        className="fixed top-0 left-0 right-0 z-40 h-14 bg-canvas flex items-stretch"
        style={{ boxShadow: "0 1px 0 rgba(43,52,55,0.08)" }}
      >
        {/* Logo — far left, outside centered container */}
        <Link href="/designer" className="pl-5 pr-4 flex items-center flex-shrink-0">
          <Logo />
        </Link>

        {/* Middle: flex-1 area with max-w-3xl centered — tab only */}
        <div className="flex-1 flex items-stretch">
          <div className="w-full max-w-3xl mx-auto flex items-end">
            <Link
              href="/designer"
              className="flex items-center px-4 pt-2.5 pb-3 text-sm font-medium text-ink rounded-tl-lg rounded-tr-lg transition-colors"
              style={{ background: "rgba(43,52,55,0.06)" }}
            >
              My Work
            </Link>
          </div>
        </div>

        {/* Right: profile — anchored to far right, outside max-w container */}
        <div className="pr-5 flex items-center gap-3 flex-shrink-0">
          {/* Avatar + name → profile page */}
          <Link
            href="/designer/profile"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <UserAvatar displayName={displayName} avatarUrl={avatarUrl} />
            <div className="text-right">
              <p className="text-xs font-medium text-ink leading-tight">{displayName}</p>
              <p className="text-[10px] text-muted capitalize leading-tight">{role}</p>
            </div>
          </Link>

          {/* Sign out — icon only */}
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 rounded text-muted hover:text-dim transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 11l3-3-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 8H3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </form>
        </div>
      </header>

      {/* Main content — offset by fixed header height */}
      <main className="pt-14">
        {children}
      </main>

    </div>
  );
}
