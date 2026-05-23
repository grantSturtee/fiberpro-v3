"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UpdateOwnProfileState } from "@/components/shared/ProfileForm";

export async function updateOwnProfile(
  _prevState: UpdateOwnProfileState,
  formData: FormData
): Promise<UpdateOwnProfileState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  // --- Display name ---
  const displayName = (formData.get("display_name") as string)?.trim();
  if (!displayName) return { error: "Display name is required." };

  // --- Password validation (both or neither) ---
  const newPassword = (formData.get("new_password") as string) ?? "";
  const confirmPassword = (formData.get("confirm_new_password") as string) ?? "";
  if (Boolean(newPassword) !== Boolean(confirmPassword)) {
    return { error: "Both password fields must be filled to change your password." };
  }
  if (newPassword && newPassword !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  // --- Avatar upload (optional) ---
  const avatarFile = formData.get("avatar") as File | null;
  let newAvatarPath: string | undefined;

  if (avatarFile && avatarFile.size > 0) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(avatarFile.type)) {
      return { error: "Avatar must be a JPEG, PNG, or WebP image." };
    }
    if (avatarFile.size > 5 * 1024 * 1024) {
      return { error: "Avatar must be 5MB or smaller." };
    }

    // Fixed path per user — upsert always replaces the same object regardless of format.
    const storagePath = `${userData.user.id}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(storagePath, avatarFile, { contentType: avatarFile.type, upsert: true });

    if (uploadError) {
      console.error("Avatar upload error:", uploadError);
      return { error: "Failed to upload avatar. Please try again." };
    }

    newAvatarPath = storagePath;
  }

  // --- Update user_profiles (display_name + optional avatar_url) ---
  const profileUpdate: { display_name: string; avatar_url?: string } = { display_name: displayName };
  if (newAvatarPath) profileUpdate.avatar_url = newAvatarPath;

  const { error: profileError } = await supabase
    .from("user_profiles")
    .update(profileUpdate)
    .eq("id", userData.user.id);

  if (profileError) {
    console.error("Profile update error:", profileError);
    return { error: "Failed to save. Please try again." };
  }

  // --- Sync auth metadata + optional password in one call ---
  const authPayload: { data: { display_name: string }; password?: string } = {
    data: { display_name: displayName },
  };
  if (newPassword) authPayload.password = newPassword;

  const { error: authError } = await supabase.auth.updateUser(authPayload);
  if (authError) {
    console.error("Auth update error:", authError);
    return { error: "Profile saved but password update failed. Please try again." };
  }

  revalidatePath("/admin/profile");
  return { error: null, success: true };
}
