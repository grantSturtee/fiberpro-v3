"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type UpdateActionState = {
  error: string | null;
  success?: boolean;
};

// ── Update status → project status mapping ────────────────────────────────────
// When a status update is posted it drives the canonical project.status.
// Restricted by role: designers can only advance within design states.

// Manual statuses users may post through the form.
// Workflow-driven statuses (submitted_for_review, revisions_required, approved, submitted)
// are written automatically by their respective actions — not manually selectable.
const MANUAL_ALLOWED_STATUSES = new Set(["not_started", "in_design"]);

const UPDATE_STATUS_TO_PROJECT_STATUS: Record<string, string> = {
  in_design:            "in_design",
  submitted_for_review: "waiting_for_admin_review",
  revisions_required:   "revisions_required",
  approved:             "approved",
  submitted:            "submitted",
  // not_started has no unambiguous project status — skip the sync
};

export async function postProjectUpdate(
  _prev: UpdateActionState,
  formData: FormData
): Promise<UpdateActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin" && role !== "designer") return { error: "Admin or designer required." };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const status = (formData.get("status") as string)?.trim() || null;
  if (!status || !MANUAL_ALLOWED_STATUSES.has(status)) return { error: "Please select a valid status." };

  const body = (formData.get("body") as string)?.trim() || null;
  if (body !== null && body.length > 2000) return { error: "Message must be 2000 characters or fewer." };

  const revalidateTo = (formData.get("revalidate_path") as string) || `/admin/projects/${projectId}`;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  const authorLabel = profile?.display_name || user.email || "Unknown";

  const { error: insertError } = await supabase
    .from("project_updates")
    .insert({ project_id: projectId, status, body, created_by: authorLabel });

  if (insertError) {
    console.error("postProjectUpdate error:", insertError);
    return { error: "Failed to post update." };
  }

  // Sync project.status — use service client since designers lack project WRITE.
  const mappedStatus = UPDATE_STATUS_TO_PROJECT_STATUS[status];
  if (mappedStatus) {
    const serviceClient = createServiceClient();
    const { error: statusError } = await serviceClient
      .from("projects")
      .update({ status: mappedStatus })
      .eq("id", projectId);
    if (statusError) {
      console.error("postProjectUpdate status sync error:", statusError);
      // Non-fatal: the update row was inserted; the status sync failed
    }
  }

  revalidatePath(revalidateTo);
  return { error: null, success: true };
}
