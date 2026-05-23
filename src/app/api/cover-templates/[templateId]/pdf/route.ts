/**
 * GET /api/cover-templates/[templateId]/pdf
 *
 * Proxies the raw PDF bytes for a cover sheet template so the overlay
 * editor can load them without exposing a direct storage URL.
 *
 * Auth: admin session cookie required.
 * Cache: private, 55 min.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin") return new Response("Forbidden", { status: 403 });

  const { data: template, error: lookupErr } = await supabase
    .from("cover_sheet_templates")
    .select("storage_path")
    .eq("id", templateId)
    .maybeSingle();

  if (lookupErr || !template) {
    return new Response("Template not found", { status: 404 });
  }

  if (!template.storage_path) {
    return new Response("Template has no file — upload a PDF first", { status: 404 });
  }

  const service = createServiceClient();
  const { data: signed, error: signErr } = await service.storage
    .from("cover-templates")
    .createSignedUrl(template.storage_path, 3600);

  if (signErr || !signed?.signedUrl) {
    console.error(
      `[cover-pdf-proxy] createSignedUrl failed for template ${templateId}`,
      `storage_path="${template.storage_path}"`,
      signErr?.message ?? "no signed URL returned"
    );
    return new Response(
      `Could not generate signed URL for path: ${template.storage_path}`,
      { status: 502 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(signed.signedUrl);
  } catch (err) {
    console.error(`[cover-pdf-proxy] fetch failed for template ${templateId}:`, err);
    return new Response("Failed to fetch PDF from storage", { status: 502 });
  }

  if (!upstream.ok) {
    console.error(
      `[cover-pdf-proxy] storage returned ${upstream.status} for template ${templateId}`,
      `storage_path="${template.storage_path}"`
    );
    return new Response(
      `Storage returned ${upstream.status}. Check path: ${template.storage_path}`,
      { status: 502 }
    );
  }

  const bytes = await upstream.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3300",
    },
  });
}
