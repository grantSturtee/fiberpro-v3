/**
 * POST /api/workflows/trigger
 *
 * Fetches a pending workflow job from DB, forwards it to the n8n webhook,
 * and marks it as "running". This is the primary integration point with n8n.
 *
 * Auth: Bearer token via WORKFLOW_API_SECRET env var.
 * Called by: the app after enqueuing a job, or a cron that sweeps pending jobs.
 *
 * n8n side: receives POST with { job_id, project_id, type, metadata } and
 * begins execution. n8n writes results back via a separate callback route.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// ── Auth ───────────────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const secret = process.env.WORKFLOW_API_SECRET;
  if (!secret) {
    // If no secret is configured, reject all requests to prevent accidental exposure.
    console.error("WORKFLOW_API_SECRET is not set — rejecting request");
    return false;
  }
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Parse body ────────────────────────────────────────────────────────────
  let body: { job_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { job_id } = body;
  if (!job_id || typeof job_id !== "string") {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "N8N_WEBHOOK_URL is not configured" }, { status: 503 });
  }

  // ── 2. Fetch job from DB ─────────────────────────────────────────────────────
  const supabase = createServiceClient();

  const { data: job, error: fetchError } = await supabase
    .from("workflow_jobs")
    .select("id, project_id, job_type, status, metadata")
    .eq("id", job_id)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "pending" && job.status !== "queued") {
    return NextResponse.json(
      { error: `Job is not pending (current status: ${job.status})` },
      { status: 409 }
    );
  }

  // ── 3. POST to n8n webhook ───────────────────────────────────────────────────
  // "type" is used in the n8n payload (not "job_type") for cleaner n8n node access.
  const n8nPayload = {
    job_id: job.id,
    project_id: job.project_id,
    type: job.job_type,
    metadata: job.metadata ?? {},
  };

  let n8nResponse: Response;
  try {
    n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(n8nPayload),
    });
  } catch (err) {
    console.error("n8n webhook fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach n8n webhook", detail: String(err) },
      { status: 502 }
    );
  }

  if (!n8nResponse.ok) {
    const text = await n8nResponse.text().catch(() => "");
    console.error(`n8n webhook returned ${n8nResponse.status}:`, text);
    return NextResponse.json(
      { error: `n8n webhook returned ${n8nResponse.status}`, detail: text },
      { status: 502 }
    );
  }

  // ── 4. Mark job as running ───────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("workflow_jobs")
    .update({
      status: "running",
      updated_at: new Date().toISOString(),
    })
    .eq("id", job_id);

  if (updateError) {
    // n8n was already called — log but don't fail the response.
    // n8n execution proceeds; status is stale but not catastrophic.
    console.error("Failed to update job status to running:", updateError);
  }

  return NextResponse.json({
    ok: true,
    job_id,
    status: "running",
  });
}
