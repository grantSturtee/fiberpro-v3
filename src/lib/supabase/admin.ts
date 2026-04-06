import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses Row Level Security.
 *
 * Use only in server actions or server-side API routes.
 * Never import this in client components or expose to the browser.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (find it in Supabase → Project Settings → API → service_role key).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "Add it to .env.local to enable admin user creation."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
