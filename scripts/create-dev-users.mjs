/**
 * GRANTED — Create local dev auth users via Supabase Admin API
 *
 * Run from granted/:
 *   node --env-file=.env.local scripts/create-dev-users.mjs
 *
 * Uses the Admin API (auth.admin.createUser) so GoTrue creates both the
 * auth.users row AND the auth.identities row in one call. Email is confirmed
 * immediately via email_confirm: true.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  {
    email: "testadmin@fiberpro.dev",
    password: "Test123!",
    role: "admin",
    displayName: "Test Admin",
  },
  {
    email: "testdesigner@fiberpro.dev",
    password: "Test123!",
    role: "designer",
    displayName: "Test Designer",
  },
];

async function main() {
  for (const user of USERS) {
    console.log(`\nCreating ${user.email}...`);

    // ── 1. Create auth user via Admin API ──────────────────────────────────
    // email_confirm: true → email_confirmed_at is set immediately, no OTP needed
    // app_metadata.role → read by middleware JWT check for route access
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      app_metadata: {
        role: user.role,
        provider: "email",
        providers: ["email"],
      },
      user_metadata: {},
    });

    if (error) {
      console.error(`  ERROR creating auth user: ${error.message}`);
      continue;
    }

    const userId = data.user.id;
    console.log(`  auth user created: ${userId}`);

    // ── 2. Upsert user_profiles ────────────────────────────────────────────
    const { error: profileError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          role: user.role,
          display_name: user.displayName,
          email: user.email,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      console.error(`  ERROR upserting user_profiles: ${profileError.message}`);
    } else {
      console.log(`  user_profiles upserted: role=${user.role}`);
    }
  }

  console.log("\nDone.");
}

main();
