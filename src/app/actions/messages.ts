"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MessageActionState = {
  error: string | null;
  success?: boolean;
};

// ── Send Project Message ──────────────────────────────────────────────────────
// Shared across company, admin, and designer surfaces.
// Sender role is read from JWT app_metadata (authoritative, set at user creation).
// Sender label is read from user_profiles.display_name.
// All messages are inserted with visible_to_company = true (shared thread MVP).

export async function sendProjectMessage(
  _prevState: MessageActionState,
  formData: FormData
): Promise<MessageActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = (formData.get("project_id") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  const revalidatePath_ = (formData.get("revalidate_path") as string)?.trim();

  if (!projectId) return { error: "Missing project ID." };
  if (!body) return { error: "Message cannot be empty." };
  if (body.length > 4000) return { error: "Message is too long (max 4000 characters)." };

  const userId = userData.user.id;
  const senderRole = (userData.user.app_metadata as { role?: string })?.role ?? "unknown";

  // Fetch display name for label snapshot
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  const senderLabel = profile?.display_name || userData.user.email || "Unknown";

  const { error: insertError } = await supabase
    .from("project_messages")
    .insert({
      project_id: projectId,
      sender_id: userId,
      sender_label: senderLabel,
      sender_role: senderRole,
      body,
      visible_to_company: true,
    });

  if (insertError) {
    console.error("sendProjectMessage error:", insertError);
    return { error: "Failed to send message." };
  }

  if (revalidatePath_) revalidatePath(revalidatePath_);

  return { error: null, success: true };
}

// ── Update Project Note ───────────────────────────────────────────────────────
// Only the note's original author may edit it.

export async function updateProjectNote(
  _prevState: MessageActionState,
  formData: FormData
): Promise<MessageActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const noteId = (formData.get("note_id") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  const revalidatePath_ = (formData.get("revalidate_path") as string)?.trim();

  if (!noteId) return { error: "Missing note ID." };
  if (!body) return { error: "Note cannot be empty." };
  if (body.length > 4000) return { error: "Note is too long (max 4000 characters)." };

  const userId = userData.user.id;

  // Ownership enforced via .eq("sender_id", userId) — non-owners get 0 rows updated
  const { error: updateError, count } = await supabase
    .from("project_messages")
    .update({ body })
    .eq("id", noteId)
    .eq("sender_id", userId);

  if (updateError) {
    console.error("updateProjectNote error:", updateError);
    return { error: "Failed to update note." };
  }
  if (count === 0) return { error: "Not authorized to edit this note." };

  if (revalidatePath_) revalidatePath(revalidatePath_);

  return { error: null, success: true };
}

// ── Delete Project Note ───────────────────────────────────────────────────────
// Authors may delete their own note. Admins may delete any note.

export async function deleteProjectNote(
  _prevState: MessageActionState,
  formData: FormData
): Promise<MessageActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const noteId = (formData.get("note_id") as string)?.trim();
  const revalidatePath_ = (formData.get("revalidate_path") as string)?.trim();

  if (!noteId) return { error: "Missing note ID." };

  const userId = userData.user.id;
  const userRole = (userData.user.app_metadata as { role?: string })?.role ?? "";
  const isAdmin = userRole === "admin";

  const query = isAdmin
    ? supabase.from("project_messages").delete().eq("id", noteId)
    : supabase.from("project_messages").delete().eq("id", noteId).eq("sender_id", userId);

  const { error: deleteError } = await query;

  if (deleteError) {
    console.error("deleteProjectNote error:", deleteError);
    return { error: "Failed to delete note." };
  }

  if (revalidatePath_) revalidatePath(revalidatePath_);

  return { error: null, success: true };
}
