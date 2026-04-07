/**
 * GET /api/workflows/pending
 *
 * Returns all jobs with status = "pending" or "queued".
 * Fallback polling endpoint — used when push-based triggering is unavailable.
 *
 * Typical usage:
 *   - A cron (e.g. Vercel cron, external scheduler) calls this every N seconds.
 *   - For each returned job, it calls POST /api/workflows/trigger with the job_id.
 *   - n8n can also poll this directly and self-trigger.
 *
 * Auth: Bearer token via WORKFLOW_API_SECRET env var.
 *
 * Response: { jobs: WorkflowJobSummary[], count: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// ── Auth ───────────────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const secret = process.env.WORKFLOW_API_SECRET;
  if (!secret) {
    console.error("WORKFLOW_API_SECRET is not set — rejecting request");
    return false;
  }
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("workflow_jobs")
    .select("id, project_id, job_type, status, metadata, created_at, updated_at")
    .in("status", ["pending", "queued"])
    .order("created_at", { ascending: true }); // oldest first — FIFO

  if (error) {
    console.error("GET /api/workflows/pending error:", error);
    return NextResponse.json({ error: "Failed to fetch pending jobs" }, { status: 500 });
  }

  const jobs = data ?? [];

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      job_id: job.id,
      project_id: job.project_id,
      type: job.job_type,
      status: job.status,
      metadata: job.metadata ?? {},
      created_at: job.created_at,
      updated_at: job.updated_at,
    })),
    count: jobs.length,
  });
}
