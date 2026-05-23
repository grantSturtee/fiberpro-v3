/**
 * GET /api/authority-templates/[templateId]/pdf
 *
 * Proxies the raw PDF bytes for an authority document template so the overlay
 * editor can load them via pdf.js without exposing a direct storage URL to the
 * browser.
 *
 * Auth: admin session cookie required.
 * Cache: private, 55 min (within 1-hour signed URL TTL).
 *
 * Common failure modes:
 *   404 — template row not found or not visible to admin
 *   502 — signed URL creation failed (usually: bucket does not exist, or the
 *          file path stored in file_url does not match what was uploaded)
 *   502 — upstream storage fetch failed (file exists in DB but not in storage)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin") return new Response("Forbidden", { status: 403 });

  // ── Template lookup ───────────────────────────────────────────────────────
  const { data: template, error: lookupErr } = await supabase
    .from("authority_document_templates")
    .select("file_url")
    .eq("id", templateId)
    .maybeSingle();

  if (lookupErr || !template) {
    return new Response("Template not found", { status: 404 });
  }

  if (!template.file_url) {
    return new Response("Template has no file — upload a PDF first", {
      status: 404,
    });
  }

  // ── Signed URL ────────────────────────────────────────────────────────────
  // The service client bypasses storage RLS; 3600-second TTL.
  const service = createServiceClient();
  const { data: signed, error: signErr } = await service.storage
    .from("authority-documents")
    .createSignedUrl(template.file_url, 3600);

  if (signErr || !signed?.signedUrl) {
    console.error(
      `[pdf-proxy] createSignedUrl failed for template ${templateId}`,
      `file_url="${template.file_url}"`,
      signErr?.message ?? "no signed URL returned"
    );
    return new Response(
      "Could not generate signed URL. " +
        "Verify the 'authority-documents' storage bucket exists and that the " +
        `file has been uploaded at path: ${template.file_url}`,
      { status: 502 }
    );
  }

  // ── Fetch bytes from storage ───────────────────────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(signed.signedUrl);
  } catch (err) {
    console.error(
      `[pdf-proxy] fetch from storage failed for template ${templateId}:`,
      err
    );
    return new Response("Failed to fetch PDF from storage", { status: 502 });
  }

  if (!upstream.ok) {
    // 403 from storage usually means the file path is wrong or the bucket is
    // private and the signed URL was generated for a non-existent object.
    console.error(
      `[pdf-proxy] storage returned ${upstream.status} for template ${templateId}`,
      `file_url="${template.file_url}"`
    );
    return new Response(
      `Storage returned ${upstream.status}. ` +
        `Check that the file exists at path: ${template.file_url}`,
      { status: 502 }
    );
  }

  const bytes = await upstream.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      // Cache for 55 min — safely within the 1-hour signed URL TTL.
      "Cache-Control": "private, max-age=3300",
    },
  });
}
