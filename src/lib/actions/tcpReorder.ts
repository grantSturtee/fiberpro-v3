"use server";

// Reorder TCP design files (Issue 4 Phase B).
//
// Used by both the admin and designer Project pages. Authorization is enforced
// here, not in the UI:
//   - admin role: any project
//   - designer role: only when projects.assigned_designer_id = auth.uid()
// Anything else is rejected.
//
// The action validates that every passed-in file id (a) exists, (b) belongs to
// the requested project, and (c) has file_category = 'tcp_pdf'. After that it
// writes sort_order = 1, 2, 3, … in array position via the service-role client.
//
// Service-role is used for the UPDATE only — designers do not have a project_files
// UPDATE policy, and Phase B intentionally avoids adding one (additional RLS
// surface area we don't need yet). All authorization is verified above the
// service call, so the bypass is bounded.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type TcpReorderResult = { ok: true } | { ok: false; error: string };

export async function reorderTcpSheets(
  projectId: string,
  orderedIds: string[],
): Promise<TcpReorderResult> {
  // 1) Input shape
  if (!projectId || typeof projectId !== "string") {
    return { ok: false, error: "Invalid project id." };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "No files to reorder." };
  }
  if (orderedIds.some((id) => typeof id !== "string" || id.length === 0)) {
    return { ok: false, error: "Invalid file id in order." };
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, error: "Duplicate file ids in order." };
  }

  // 2) Authenticate
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not authenticated." };
  const role = (user.app_metadata as { role?: string } | null)?.role ?? null;

  // 3) Authorize
  let authorized = false;
  if (role === "admin") {
    authorized = true;
  } else if (role === "designer") {
    const { data: projectRow } = await supabase
      .from("projects")
      .select("assigned_designer_id")
      .eq("id", projectId)
      .maybeSingle();
    const assignedTo =
      (projectRow as { assigned_designer_id: string | null } | null)?.assigned_designer_id ?? null;
    authorized = assignedTo === user.id;
  }
  if (!authorized) return { ok: false, error: "Not authorized to reorder this project's TCP sheets." };

  // 4) Validate ownership + category for every id
  const service = createServiceClient();
  const { data: rows, error: rowsErr } = await service
    .from("project_files")
    .select("id, project_id, file_category")
    .in("id", orderedIds);
  if (rowsErr) return { ok: false, error: "Lookup failed." };
  const rowList =
    (rows as Array<{ id: string; project_id: string; file_category: string }> | null) ?? [];
  if (rowList.length !== orderedIds.length) {
    return { ok: false, error: "One or more files not found." };
  }
  const allValid = rowList.every(
    (r) => r.project_id === projectId && r.file_category === "tcp_pdf",
  );
  if (!allValid) {
    return { ok: false, error: "All files must belong to this project and be TCP sheets." };
  }

  // 5) Apply sort_order in array position. Small N (typically <50), parallel
  //    one-row updates are simpler and safer than a CASE expression here.
  const updates = await Promise.all(
    orderedIds.map((id, idx) =>
      service.from("project_files").update({ sort_order: idx + 1 }).eq("id", id),
    ),
  );
  const updateError = updates.find((r) => r.error)?.error;
  if (updateError) {
    return { ok: false, error: `Save failed: ${updateError.message}` };
  }

  // 6) Refresh both routes that render this project's TCP list
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/designer/projects/${projectId}`);

  return { ok: true };
}
