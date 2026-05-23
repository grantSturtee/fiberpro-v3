import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

// cache() deduplicates across an entire React render tree (layout + page + all
// server components in the same request). Without it, each createClient() call
// returns a *separate* instance with its own empty in-memory setItems cache.
// When one instance refreshes an expiring token, the new token lives only in
// that instance's setItems — a sibling instance still sees the old cookie
// value, decides the token is near-expiry, and issues a second concurrent
// refresh that Supabase rejects with 409 "Too many concurrent token refresh
// requests on the same session". cache() collapses all calls to one instance
// so the refreshed token propagates to every consumer in the same render.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore cookie writes in Server Components.
            // Cookie updates are only allowed in Server Actions or Route Handlers.
          }
        },
      },
    }
  );
});