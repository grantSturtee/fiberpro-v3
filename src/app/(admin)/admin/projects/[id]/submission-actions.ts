"use server";

/**
 * Server actions for the Submission Tracking workflow.
 *
 * These handle everything that happens after a permit package is generated:
 *   ready_for_submission → submitted → waiting_on_authority
 *   → authority_action_needed → permit_received → closed
 *
 * Each status-transition action also logs to project_activity for audit.
 * saveSubmissionFields updates tracking detail fields without changing status.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveUnifiedStatus } from "@/lib/status/unifiedMapping";

export type SubmissionActionState = {
  error: string | null;
  success?: boolean;
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, actorLabel: null, error: "Not signed in." };
  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, actorLabel: null, error: "Admin required." };

  // Resolve display name for activity log
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return { supabase, actorLabel: profile?.display_name ?? "Admin", error: null };
}

async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  actorLabel: string,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("project_activity").insert({
    project_id:  projectId,
    actor_label: actorLabel,
    action,
    metadata,
  });
}

// ── Mark Ready for Submission ──────────────────────────────────────────────────
// Available from any post-approval status (approved, package_generating, or
// after re-submission from authority_action_needed).

export async function markReadyForSubmission(
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const { data: currentRow } = await supabase
    .from("projects")
    .select("billing_status")
    .eq("id", projectId)
    .single();
  const currentBilling = (currentRow?.billing_status as string) ?? "";

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({
      status: "ready_for_submission",
      unified_status: resolveUnifiedStatus("ready_for_submission", currentBilling),
    })
    .eq("id", projectId)
    .in("status", ["approved", "package_generating", "authority_action_needed"])
    .select("id");

  if (updateError) return { error: "Failed to update status." };
  if (!data?.length) return { error: "Cannot mark ready — project must be in Approved, Generating, or Authority Action Needed state." };

  await logActivity(supabase, projectId, actorLabel, "Marked ready for submission");
  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Record Submission ──────────────────────────────────────────────────────────
// Marks the project as submitted and saves all the submission detail fields
// in a single operation — so "Mark Submitted" and "Save Details" happen at once.

export async function recordSubmission(
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId     = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const { data: currentRow } = await supabase
    .from("projects")
    .select("billing_status")
    .eq("id", projectId)
    .single();
  const currentBilling = (currentRow?.billing_status as string) ?? "";

  const submissionDate         = (formData.get("submission_date") as string)?.trim()         || null;
  const submissionMethod       = (formData.get("submission_method") as string)?.trim()       || null;
  const recipientName          = (formData.get("recipient_name") as string)?.trim()          || null;
  const recipientEmail         = (formData.get("recipient_email") as string)?.trim()         || null;
  const trackingReference      = (formData.get("authority_tracking_number") as string)?.trim() || null;
  const expectedResponseDate   = (formData.get("expected_response_date") as string)?.trim()  || null;
  const submissionNotes        = (formData.get("permit_notes") as string)?.trim()            || null;

  const VALID_METHODS = ["email", "portal", "mail", "courier", "in_person"];
  const cleanMethod = submissionMethod && VALID_METHODS.includes(submissionMethod)
    ? submissionMethod : null;

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({
      status:                    "submitted",
      unified_status:            resolveUnifiedStatus("submitted", currentBilling),
      submission_date:           submissionDate   || new Date().toISOString().split("T")[0],
      submission_method:         cleanMethod,
      recipient_name:            recipientName,
      recipient_email:           recipientEmail,
      authority_tracking_number: trackingReference,
      expected_response_date:    expectedResponseDate,
      permit_notes:              submissionNotes,
    })
    .eq("id", projectId)
    .eq("status", "ready_for_submission")
    .select("id");

  if (updateError) {
    console.error("recordSubmission error:", updateError);
    return { error: "Failed to record submission." };
  }
  if (!data?.length) return { error: "Cannot record submission — project must be in Ready for Submission state." };

  const details = [
    cleanMethod && `via ${cleanMethod}`,
    recipientName && `to ${recipientName}`,
    trackingReference && `ref: ${trackingReference}`,
  ].filter(Boolean).join(", ");

  await Promise.all([
    logActivity(
      supabase, projectId, actorLabel,
      details ? `Submitted to authority (${details})` : "Submitted to authority",
      { submission_method: cleanMethod, recipient_name: recipientName, tracking_reference: trackingReference }
    ),
    supabase.from("project_updates").insert({
      project_id: projectId,
      status: "submitted",
      body: details ? `Submitted to authority (${details}).` : "Submitted to authority.",
      created_by: actorLabel,
    }),
  ]);

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Mark Awaiting Authority Response ──────────────────────────────────────────

export async function markWaitingOnAuthority(
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const { data: currentRow } = await supabase
    .from("projects")
    .select("billing_status")
    .eq("id", projectId)
    .single();
  const currentBilling = (currentRow?.billing_status as string) ?? "";

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({
      status: "waiting_on_authority",
      unified_status: resolveUnifiedStatus("waiting_on_authority", currentBilling),
    })
    .eq("id", projectId)
    .eq("status", "submitted")
    .select("id");

  if (updateError) return { error: "Failed to update status." };
  if (!data?.length) return { error: "Cannot mark waiting — project must be in Submitted state." };

  await logActivity(supabase, projectId, actorLabel, "Marked awaiting authority response");
  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Mark Authority Action Needed ───────────────────────────────────────────────
// Covers both "rejected" and "needs more info / corrections" cases.

export async function markAuthorityActionNeeded(
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const notes = (formData.get("action_notes") as string)?.trim() || null;

  const { data: currentRow } = await supabase
    .from("projects")
    .select("billing_status")
    .eq("id", projectId)
    .single();
  const currentBilling = (currentRow?.billing_status as string) ?? "";

  const patch: Record<string, unknown> = {
    status: "authority_action_needed",
    unified_status: resolveUnifiedStatus("authority_action_needed", currentBilling),
  };
  if (notes) patch.permit_notes = notes;

  const { data, error: updateError } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .in("status", ["submitted", "waiting_on_authority"])
    .select("id");

  if (updateError) return { error: "Failed to update status." };
  if (!data?.length) return { error: "Cannot mark authority action needed — project must be Submitted or Waiting on Authority." };

  await logActivity(
    supabase, projectId, actorLabel,
    notes ? `Authority action needed: ${notes}` : "Authority action needed",
    notes ? { notes } : {}
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Mark Permit Received ───────────────────────────────────────────────────────

export async function markPermitReceived(
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId      = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const receivedDate   = (formData.get("permit_received_date") as string)?.trim()
    || new Date().toISOString().split("T")[0];

  const { data: currentRow } = await supabase
    .from("projects")
    .select("billing_status")
    .eq("id", projectId)
    .single();
  const currentBilling = (currentRow?.billing_status as string) ?? "";

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({
      status:               "permit_received",
      unified_status:       resolveUnifiedStatus("permit_received", currentBilling),
      permit_received_date: receivedDate,
    })
    .eq("id", projectId)
    .in("status", ["submitted", "waiting_on_authority", "authority_action_needed"])
    .select("id");

  if (updateError) return { error: "Failed to update status." };
  if (!data?.length) return { error: "Cannot mark permit received — project must be Submitted, Waiting on Authority, or Authority Action Needed." };

  await logActivity(
    supabase, projectId, actorLabel,
    `Permit received (${receivedDate})`,
    { permit_received_date: receivedDate }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Save Submission Fields ─────────────────────────────────────────────────────
// Updates tracking detail fields without changing project status.
// Used for updating reference numbers, contact details, notes mid-flow.

export async function saveSubmissionFields(
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const VALID_METHODS = ["email", "portal", "mail", "courier", "in_person"];
  const rawMethod = (formData.get("submission_method") as string)?.trim() || null;
  const cleanMethod = rawMethod && VALID_METHODS.includes(rawMethod) ? rawMethod : null;

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      submission_date:           (formData.get("submission_date") as string)?.trim()           || null,
      submission_method:         cleanMethod,
      recipient_name:            (formData.get("recipient_name") as string)?.trim()            || null,
      recipient_email:           (formData.get("recipient_email") as string)?.trim()           || null,
      authority_tracking_number: (formData.get("authority_tracking_number") as string)?.trim() || null,
      expected_response_date:    (formData.get("expected_response_date") as string)?.trim()    || null,
      permit_received_date:      (formData.get("permit_received_date") as string)?.trim()      || null,
      permit_notes:              (formData.get("permit_notes") as string)?.trim()              || null,
    })
    .eq("id", projectId);

  if (updateError) {
    console.error("saveSubmissionFields error:", updateError);
    return { error: "Failed to save." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}
