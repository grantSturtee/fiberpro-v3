import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { ProfileForm } from "@/components/shared/ProfileForm";
import { updateOwnProfile } from "./actions";

export const metadata: Metadata = { title: "Profile" };

export default async function DesignerProfilePage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  // Core fields — resilient to missing avatar_url column (same pattern as layouts).
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, email")
    .eq("id", userData.user.id)
    .single();

  // Avatar — separate query so a missing column cannot blank out display_name.
  const { data: avatarProfile } = await supabase
    .from("user_profiles")
    .select("avatar_url")
    .eq("id", userData.user.id)
    .single();

  // Resolve stored path to a short-lived signed URL for rendering.
  // Falls back to null (initials) if path is absent, column missing, or signing fails.
  let avatarUrl: string | null = null;
  if (avatarProfile?.avatar_url) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(avatarProfile.avatar_url, 3600);
    avatarUrl = signed?.signedUrl ?? null;
  }

  const user = {
    display_name: profile?.display_name ?? "",
    email: profile?.email ?? userData.user.email ?? "",
    avatarUrl,
  };

  return (
    <div className="p-8 space-y-6 max-w-2xl mx-auto">
      <PageHeader title="Profile" subtitle="Manage your account information." />
      <SectionCard title="Account">
        <ProfileForm user={user} action={updateOwnProfile} />
      </SectionCard>
    </div>
  );
}
