/**
 * POST /api/workflows/complete
 *
 * Called by n8n after a workflow job finishes (success or failure).
 * Updates the workflow_jobs row and, for completed permit packages,
 * creates a project_files record so the file appears in the UI.
 *
 * Auth: x-workflow-secret header must match WORKFLOW_SECRET env var.
 *
 * Body:
 *   {
 *     job_id: string,
 *     status: "completed" | "failed",
 *     result: Record<string, unknown> | null,
 *     error:  string | null
 *   }
 *
 * For generate_permit_package completions, result must include:
 *   { file_path: string, file_name?: string }
 * so a project_files row can be created.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// ── Auth ───────────────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const secret = process.env.WORKFLOW_SECRET;
  if (!secret) {
    console.error("WORKFLOW_SECRET is not set — rejecting request");
    return false;
  }
  return req.headers.get("x-workflow-secret") === secret;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type CompleteBody = {
  job_id: string;
  status: "completed" | "failed";
  result?: Record<string, unknown> | null;
  error?: string | null;
};

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Parse and validate body ───────────────────────────────────────────────
  let body: CompleteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { job_id, status, result = null, error = null } = body;

  if (!job_id || typeof job_id !== "string") {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }
  if (status !== "completed" && status !== "failed") {
    return NextResponse.json(
      { error: "status must be 'completed' or 'failed'" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // ── 2. Fetch job ─────────────────────────────────────────────────────────────
  const { data: job, error: fetchError } = await supabase
    .from("workflow_jobs")
    .select("id, project_id, job_type, status")
    .eq("id", job_id)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "completed" || job.status === "cancelled") {
    // Idempotent: already in a terminal state — return success so n8n doesn't retry.
    return NextResponse.json({ ok: true, job_id, status: job.status, skipped: true });
  }

  // ── 3. Update workflow_jobs ──────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("workflow_jobs")
    .update({
      status,
      result: result ?? null,
      error: error ?? null,
      updated_at: now,
      ...(status === "completed" ? { completed_at: now } : {}),
    })
    .eq("id", job_id);

  if (updateError) {
    console.error("workflow complete: update error:", updateError);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }

  // ── 4. Post-completion side-effects ─────────────────────────────────────────

  if (job.job_type === "generate_permit_package" && status === "completed") {
    const filePath = result?.file_path;
    if (!filePath || typeof filePath !== "string") {
      console.warn(
        `workflow complete: generate_permit_package job ${job_id} completed but result.file_path is missing`
      );
    } else {
      const fileName =
        (result?.file_name && typeof result.file_name === "string")
          ? result.file_name
          : filePath.split("/").pop() ?? "permit_package.pdf";

      const { error: fileError } = await supabase.from("project_files").insert({
        project_id: job.project_id,
        file_category: "permit_package",
        file_type: "generated",
        file_name: fileName,
        storage_path: filePath,
        uploader_label: "n8n",
      });

      if (fileError) {
        // Log but don't fail the response — job status is already written.
        console.error("workflow complete: failed to create project_files row:", fileError);
      }
    }
  }

  return NextResponse.json({ ok: true, job_id, status });
}
