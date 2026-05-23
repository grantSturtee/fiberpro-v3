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
 *
 * Persistence guarantee for generate_permit_package + completed:
 *   1. project_files row is inserted (or confirmed already present) FIRST.
 *   2. Only after a successful insert does the job get marked "completed".
 *   3. If the insert fails, the job is marked "failed" and 500 is returned
 *      so n8n can retry the callback — the PDF in storage is not re-uploaded,
 *      only the DB row is retried.
 *   4. A storage_path deduplication check prevents double rows if n8n calls
 *      this endpoint more than once for the same successful run.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { autoRecomputeAfterPackage } from "@/lib/compute/projectCompute";
import { resolveUnifiedStatus } from "@/lib/status/unifiedMapping";

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

  const rawJobId = body.job_id;
  const job_id =
    typeof rawJobId === "string" ? rawJobId.replace(/^=/, "") : rawJobId;

  const { status, result = null, error = null } = body;

  const normalizedResult =
    result && typeof result === "object"
      ? {
          ...result,
          file_path:
            typeof result.file_path === "string"
              ? result.file_path.replace(/^=/, "")
              : result.file_path,
        }
      : result;

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

  console.log("workflow complete lookup", { job_id, job, fetchError });

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "completed" || job.status === "cancelled") {
    // Idempotent: already in a terminal state — return success so n8n doesn't retry.
    return NextResponse.json({ ok: true, job_id, status: job.status, skipped: true });
  }

  // ── 3. Permit package success path — must write project_files BEFORE completing ──
  //
  // Order matters: the DB row must exist before the job is marked completed.
  // If the insert fails, we mark the job failed and return 500 so n8n can
  // retry the /complete callback without re-running the full generation.

  if (job.job_type === "generate_permit_package" && status === "completed") {
    const filePath =
      typeof normalizedResult?.file_path === "string"
        ? normalizedResult.file_path
        : null;

    if (!filePath) {
      // n8n sent a success callback but omitted the file path — treat as failure.
      console.error(
        `workflow complete: generate_permit_package job ${job_id} completed but result.file_path is missing`
      );
      await supabase
        .from("workflow_jobs")
        .update({
          status: "failed",
          error: "result.file_path missing from n8n callback",
          updated_at: now,
        })
        .eq("id", job_id);

      await supabase.from("project_activity").insert({
        project_id: job.project_id,
        actor_id: null,
        actor_label: "System",
        action: "Package generation failed",
        metadata: { job_id, error: "result.file_path missing from n8n callback" },
      });

      return NextResponse.json(
        { error: "result.file_path is required for generate_permit_package" },
        { status: 400 }
      );
    }

    // Deduplication: if a project_files row already exists for this exact storage
    // path (e.g. n8n retried the callback), skip the insert and proceed to mark
    // the job completed so the idempotency guard on the next call takes over.
    const { data: existingFile } = await supabase
      .from("project_files")
      .select("id")
      .eq("storage_path", filePath)
      .maybeSingle();

    if (!existingFile) {
      const fileName =
        typeof result?.file_name === "string"
          ? result.file_name
          : filePath.split("/").pop() ?? "permit_package.pdf";

      const { error: fileError } = await supabase.from("project_files").insert({
        project_id: job.project_id,
        file_category: "permit_package",
        file_type: "generated",
        file_name: fileName,
        storage_path: filePath,
        mime_type: "application/pdf",
        uploader_label: "System",
        source: "system_generated",
      });

      if (fileError) {
        // Insert failed — mark job as failed so n8n can retry the /complete callback.
        // The uploaded PDF in storage is still intact; only the DB row is missing.
        console.error(
          "workflow complete: project_files insert failed — marking job failed for retry:",
          fileError
        );
        await supabase
          .from("workflow_jobs")
          .update({
            status: "failed",
            error: `project_files insert failed: ${fileError.message}`,
            updated_at: now,
          })
          .eq("id", job_id);

        return NextResponse.json(
          { error: "Failed to record generated file — job marked failed for retry" },
          { status: 500 }
        );
      }
    }

    // project_files row is present — now commit job as completed.
    await supabase
      .from("workflow_jobs")
      .update({
        status: "completed",
        result: normalizedResult ?? null,
        error: null,
        updated_at: now,
        completed_at: now,
      })
      .eq("id", job_id);

    // Advance billing_status to ready_to_invoice if it hasn't moved past not_ready.
    // Best-effort: failure here does not affect the workflow completion response.
    const { data: currentRow } = await supabase
      .from("projects")
      .select("status")
      .eq("id", job.project_id)
      .single();
    const currentStatus = (currentRow?.status as string) ?? "";

    await supabase
      .from("projects")
      .update({
        billing_status: "ready_to_invoice",
        unified_status: resolveUnifiedStatus(currentStatus, "ready_to_invoice"),
      })
      .eq("id", job.project_id)
      .eq("billing_status", "not_ready");

    await supabase.from("project_activity").insert({
      project_id: job.project_id,
      actor_id: null,
      actor_label: "System",
      action: "Permit package generated",
      metadata: { job_id },
    });

    // Phase H2: auto-recompute pricing as the final step of package
    // completion. Idempotent — if /api/generate-package already ran the
    // compute moments ago (normal n8n flow), this short-circuits. Never
    // throws so a pricing failure cannot affect the n8n acknowledgement.
    await autoRecomputeAfterPackage(
      supabase,
      job.project_id as string,
      "workflows-complete"
    );

    return NextResponse.json({ ok: true, job_id, status: "completed" });
  }

  // ── 4. All other job types (or failed status) ────────────────────────────────
  const { error: updateError } = await supabase
    .from("workflow_jobs")
    .update({
      status,
      result: normalizedResult ?? null,
      error: error ?? null,
      updated_at: now,
      ...(status === "completed" ? { completed_at: now } : {}),
    })
    .eq("id", job_id);

  if (updateError) {
    console.error("workflow complete: update error:", updateError);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }

  // Activity log for permit package failures (non-permit types don't get activity entries here).
  if (job.job_type === "generate_permit_package" && status === "failed") {
    await supabase.from("project_activity").insert({
      project_id: job.project_id,
      actor_id: null,
      actor_label: "System",
      action: "Package generation failed",
      metadata: { job_id, error: error ?? null },
    });
  }

  return NextResponse.json({ ok: true, job_id, status });
}
