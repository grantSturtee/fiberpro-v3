/**
 * GRANTED — Test Data Reset Script
 *
 * Deletes all company/project test data while preserving all internal
 * GRANTED configuration (admins, designers, templates, authorities, etc.)
 *
 * ─── Run modes ───────────────────────────────────────────────────────────────
 *
 *   Dry run (prints scope, deletes nothing):
 *     DRY_RUN=true npx tsx --env-file=.env.local scripts/reset-test-data.ts
 *
 *   Live execution (prompts for confirmation):
 *     FORCE=true npx tsx --env-file=.env.local scripts/reset-test-data.ts
 *
 * ─── What gets deleted ───────────────────────────────────────────────────────
 *
 *   • All projects and every child table (files, messages, activity, jobs…)
 *   • All companies and company_memberships
 *   • All external users: company_admin, project_manager
 *     → their auth.users, user_profiles, and any remaining memberships
 *   • project-files bucket objects for deleted projects
 *   • avatars bucket objects for deleted external users
 *
 * ─── What is preserved ───────────────────────────────────────────────────────
 *
 *   • admin and designer auth.users + user_profiles
 *   • authority_profiles, authority_document_templates
 *   • cover_sheet_templates, cover_template_versions
 *   • tcd_library, jurisdictions, jurisdiction_requirements
 *   • pricing_rules, package_blueprints, package_template_sets
 *   • page_templates, page_template_assets, app_settings
 *   • tcd-pdfs, cover-templates, page-templates, authority-documents buckets
 *   • Storage buckets themselves (never deleted)
 *
 * ⚠️  NEVER run against production. Verify the project URL printed at startup.
 */

import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";

// ── Environment ───────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "true";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL) {
  console.error(
    "❌  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is not set.\n" +
      "    Pass --env-file=.env.local or export the variable."
  );
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    "❌  SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
      "    Pass --env-file=.env.local or export the variable."
  );
  process.exit(1);
}
if (!DRY_RUN && !FORCE) {
  console.error(
    "❌  No run mode specified.\n\n" +
      "    Dry run (safe — no changes):\n" +
      "      DRY_RUN=true npx tsx --env-file=.env.local scripts/reset-test-data.ts\n\n" +
      "    Live execution:\n" +
      "      FORCE=true npx tsx --env-file=.env.local scripts/reset-test-data.ts"
  );
  process.exit(1);
}

const EXTERNAL_ROLES = ["company_admin", "project_manager"];

// Tables that may not exist in every local DB instance. Missing = skip, not crash.
const OPTIONAL_TABLES = new Set([
  "conversation_last_seen",
  "project_manager_assignments",
  "workflow_jobs",
  "project_updates",
  "project_messages",
  "project_activity",
  "project_tcd_selections",
  "project_files",
  "template_sets",
]);

// Accumulates names of optional tables that were absent during this run.
const skippedOptionalTables = new Set<string>();

function isTableMissingError(message: string): boolean {
  return (
    message.includes("in the schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

// ── Local storage override ─────────────────────────────────────────────────────
//
// Occasionally a local Supabase Storage object becomes corrupted and cannot be
// deleted by any means — not by the API and not by Supabase Studio. This list
// lets the script skip those specific paths on localhost/127.0.0.1 only so that
// DB deletion can still proceed.
//
// This override NEVER applies to hosted/production Supabase URLs. If an entry
// here fails to delete against a hosted instance, the script still blocks.
//
// Format: { [bucket]: [exact object path, ...] }
//
const KNOWN_UNDELETABLE_LOCAL_STORAGE_OBJECTS: Record<string, string[]> = {
  "project-files": [
    "72cdaaa3-4072-404c-90ad-d1a1f49a7ee8/intake/1775661935777_TestProjectIntakeAttachment.pdf",
  ],
};

// ── Client ────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg);
}

function step(msg: string) {
  console.log(`\n→ ${msg}`);
}

function isLocalUrl(url: string): boolean {
  return url.includes("127.0.0.1") || url.includes("localhost");
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} [yes/no]: `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

async function deleteRows(
  table: string,
  column: string,
  ids: string[],
  opts?: { optional?: boolean }
): Promise<number> {
  if (ids.length === 0) {
    log(`   (nothing to delete)`);
    return 0;
  }
  if (DRY_RUN) {
    log(`   [DRY RUN] Would delete from ${table} WHERE ${column} IN (${ids.length} ids)`);
    return 0;
  }
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .in(column, ids);
  if (error) {
    if (opts?.optional && isTableMissingError(error.message)) {
      log(`   Skipping missing table: ${table}`);
      skippedOptionalTables.add(table);
      return 0;
    }
    throw new Error(`delete ${table}: ${error.message}`);
  }
  log(`   ✓ ${count ?? "?"} rows deleted`);
  return count ?? 0;
}

async function listStorageFolder(
  bucket: string,
  folderPrefix: string
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folderPrefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error)
      throw new Error(`list ${bucket}/${folderPrefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      if (item.id !== null) {
        // item.id is null for virtual folders; non-null means it's a real file
        paths.push(`${folderPrefix}/${item.name}`);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return paths;
}

async function removeStorageObjects(
  bucket: string,
  paths: string[],
  label: string
): Promise<number> {
  if (paths.length === 0) {
    log(`   (no objects to remove)`);
    return 0;
  }
  if (DRY_RUN) {
    log(`   [DRY RUN] Would remove ${paths.length} objects from "${bucket}" (${label}):`);
    const localOverrides = KNOWN_UNDELETABLE_LOCAL_STORAGE_OBJECTS[bucket] ?? [];
    for (const p of paths) {
      if (localOverrides.includes(p)) {
        log(`     • ${p}  ← local-only override (skipped if deletion fails on localhost)`);
      } else {
        log(`     • ${p}`);
      }
    }
    return 0;
  }

  const BATCH_SIZE = 10;
  const failedPaths: string[] = [];
  let removed = 0;
  const totalBatches = Math.ceil(paths.length / BATCH_SIZE);

  log(`   Removing ${paths.length} objects from "${bucket}" in ${totalBatches} batch(es)...`);

  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    log(`\n   Batch ${batchNum}/${totalBatches} (${batch.length} objects):`);
    for (const p of batch) log(`     • ${p}`);

    const { error: batchError } = await supabase.storage.from(bucket).remove(batch);

    if (!batchError) {
      removed += batch.length;
      log(`   Batch ${batchNum} ✓`);
    } else {
      log(`   Batch ${batchNum} failed: ${batchError.message}`);
      log(`   Falling back to one-by-one for these ${batch.length} objects...`);

      const localOverrides = KNOWN_UNDELETABLE_LOCAL_STORAGE_OBJECTS[bucket] ?? [];
      for (const path of batch) {
        const { error: singleError } = await supabase.storage
          .from(bucket)
          .remove([path]);
        if (singleError) {
          if (isLocalUrl(SUPABASE_URL) && localOverrides.includes(path)) {
            log(`\n   ⚠️  KNOWN LOCAL OVERRIDE — cannot delete: ${path}`);
            log(`   ⚠️  This object is corrupted in local Supabase storage (also fails in Studio).`);
            log(`   ⚠️  Skipping on localhost only. DB deletion will proceed.\n`);
          } else {
            log(`   ✗ ${path} — ${singleError.message}`);
            failedPaths.push(path);
          }
        } else {
          removed++;
          log(`   ✓ ${path}`);
        }
      }
    }
  }

  if (failedPaths.length > 0) {
    log(
      `\n   ✗ ${failedPaths.length} object(s) could not be deleted from "${bucket}":`,
    );
    for (const p of failedPaths) log(`     • ${p}`);
    throw new Error(
      `Storage cleanup incomplete: ${failedPaths.length} object(s) in "${bucket}" ` +
        `could not be removed. DB rows were NOT deleted. Resolve the paths above ` +
        `manually in the Supabase dashboard, then rerun.`,
    );
  }

  log(`\n   ✓ ${removed}/${paths.length} objects removed from "${bucket}"`);
  return removed;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Header ────────────────────────────────────────────────────────────────

  log("\n================================================================");
  log("  GRANTED — Test Data Reset");
  log("================================================================");
  log(`  Target:  ${SUPABASE_URL}`);
  log(`  Mode:    ${DRY_RUN ? "DRY RUN  (no changes will be made)" : "LIVE EXECUTION ⚠️"}`);
  log("================================================================");

  // ── Step 1: Collect IDs ───────────────────────────────────────────────────

  log("\n📋  Collecting scope...");

  const { data: externalProfiles, error: profilesErr } = await supabase
    .from("user_profiles")
    .select("id, email, role")
    .in("role", EXTERNAL_ROLES);
  if (profilesErr)
    throw new Error(`fetch external user_profiles: ${profilesErr.message}`);
  const externalUserIds = (externalProfiles ?? []).map((p) => p.id as string);

  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, name");
  if (companiesErr) throw new Error(`fetch companies: ${companiesErr.message}`);
  const companyIds = (companies ?? []).map((c) => c.id as string);

  const { data: projects, error: projectsErr } = await supabase
    .from("projects")
    .select("id, job_number, job_name");
  if (projectsErr) throw new Error(`fetch projects: ${projectsErr.message}`);
  const projectIds = (projects ?? []).map((p) => p.id as string);

  // Collect exact storage paths from project_files rows (avoids recursive listing)
  let projectStoragePaths: string[] = [];
  let projectFileRowCount = 0;
  if (projectIds.length > 0) {
    const { data: projectFiles, error: filesErr } = await supabase
      .from("project_files")
      .select("storage_path")
      .in("project_id", projectIds);
    if (filesErr) {
      if (isTableMissingError(filesErr.message)) {
        log(`   Skipping missing table: project_files (storage paths unavailable)`);
        skippedOptionalTables.add("project_files");
      } else {
        throw new Error(`fetch project_files: ${filesErr.message}`);
      }
    } else {
      projectFileRowCount = (projectFiles ?? []).length;
      projectStoragePaths = (projectFiles ?? [])
        .map((f) => f.storage_path as string)
        .filter(Boolean);
    }
  }

  // Collect avatar paths by listing the avatars bucket per user prefix
  let avatarStoragePaths: string[] = [];
  for (const userId of externalUserIds) {
    const paths = await listStorageFolder("avatars", userId);
    avatarStoragePaths = avatarStoragePaths.concat(paths);
  }

  // ── Step 2: Print scope ───────────────────────────────────────────────────

  log("\n📊  Reset scope:\n");
  log(`  Companies:             ${companyIds.length}`);
  if ((companies ?? []).length > 0) {
    for (const c of companies!) log(`    • ${c.name}  (${c.id})`);
  }
  log(`\n  Projects:              ${projectIds.length}`);
  if ((projects ?? []).length > 0) {
    for (const p of projects!) {
      log(`    • ${p.job_number ?? "—"}  ${p.job_name ?? "(no name)"}  (${p.id})`);
    }
  }
  log(`\n  External users:        ${externalUserIds.length}`);
  if ((externalProfiles ?? []).length > 0) {
    for (const p of externalProfiles!) {
      log(`    • ${p.email}  [${p.role}]  (${p.id})`);
    }
  }
  log(`\n  project_files rows:    ${projectFileRowCount}`);
  log(`  project-files objects: ${projectStoragePaths.length}`);
  log(`  avatars objects:       ${avatarStoragePaths.length}`);

  if (
    companyIds.length === 0 &&
    projectIds.length === 0 &&
    externalUserIds.length === 0
  ) {
    log("\n✅  Nothing to reset. Database is already clean.\n");
    return;
  }

  // ── Step 3: Dry-run exit ──────────────────────────────────────────────────

  if (DRY_RUN) {
    log(
      "\n🔍  DRY RUN complete. No changes were made.\n\n" +
        "    To execute:\n" +
        "      FORCE=true npx tsx --env-file=.env.local scripts/reset-test-data.ts\n"
    );
    return;
  }

  // ── Step 3b: Confirm ──────────────────────────────────────────────────────

  log("\n");
  log("⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("⚠️   THIS WILL PERMANENTLY DELETE ALL COMPANY AND PROJECT DATA");
  log("⚠️   Internal GRANTED configuration will NOT be touched.");
  log("⚠️   This action CANNOT be undone.");
  log("⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (!FORCE) {
    const ok = await confirm(
      `\n  Delete ${companyIds.length} companies, ${projectIds.length} projects, ` +
        `and ${externalUserIds.length} external users from\n  ${SUPABASE_URL}?`
    );
    if (!ok) {
      log("\n  Aborted. No changes made.\n");
      return;
    }
  } else {
    log("\n  FORCE=true — skipping confirmation prompt.");
  }

  log("\n🗑️   Starting deletion...");

  // ── Step 4: Storage — project-files ──────────────────────────────────────
  // Must happen BEFORE deleting project_files rows (rows are the source of paths)

  step("Storage: project-files bucket");
  await removeStorageObjects("project-files", projectStoragePaths, "project uploads");

  // ── Step 5: Storage — avatars ─────────────────────────────────────────────

  step("Storage: avatars bucket");
  await removeStorageObjects("avatars", avatarStoragePaths, "external user avatars");

  // ── Step 6: Project child tables ─────────────────────────────────────────
  // All cascade on projects.id, but deleting explicitly ensures clean accounting
  // and avoids relying on cascade behavior for tables that may not have it.

  if (projectIds.length > 0) {
    step("conversation_last_seen");
    await deleteRows("conversation_last_seen", "project_id", projectIds, { optional: true });

    step("project_manager_assignments");
    await deleteRows("project_manager_assignments", "project_id", projectIds, { optional: true });

    step("workflow_jobs");
    await deleteRows("workflow_jobs", "project_id", projectIds, { optional: true });

    step("project_updates");
    await deleteRows("project_updates", "project_id", projectIds, { optional: true });

    step("project_messages");
    await deleteRows("project_messages", "project_id", projectIds, { optional: true });

    step("project_activity");
    await deleteRows("project_activity", "project_id", projectIds, { optional: true });

    step("project_tcd_selections");
    await deleteRows("project_tcd_selections", "project_id", projectIds, { optional: true });

    step("project_files (rows)");
    await deleteRows("project_files", "project_id", projectIds, { optional: true });

    step("projects");
    await deleteRows("projects", "id", projectIds);
  } else {
    log("\n  (no projects — skipping project child tables)");
  }

  // ── Step 7: Company-linked tables ─────────────────────────────────────────

  if (companyIds.length > 0) {
    step("template_sets (cascades template_assets)");
    await deleteRows("template_sets", "company_id", companyIds, { optional: true });

    step("company_memberships");
    await deleteRows("company_memberships", "company_id", companyIds);

    step("companies");
    await deleteRows("companies", "id", companyIds);
  } else {
    log("\n  (no companies — skipping company-linked tables)");
  }

  // ── Step 8: External auth users ───────────────────────────────────────────
  // auth.admin.deleteUser cascades: user_profiles (ON DELETE CASCADE),
  // any remaining company_memberships (ON DELETE CASCADE),
  // conversation_last_seen (ON DELETE CASCADE),
  // project_manager_assignments (ON DELETE CASCADE).

  step(`auth.users — ${externalUserIds.length} external user(s)`);
  if (externalUserIds.length > 0) {
    let deleted = 0;
    let failed = 0;
    for (const userId of externalUserIds) {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) {
        console.error(`   ✗ auth.deleteUser(${userId}): ${error.message}`);
        failed++;
      } else {
        deleted++;
      }
    }
    log(`   ✓ ${deleted} auth users deleted${failed > 0 ? `, ${failed} failed` : ""}`);
    log(`     (user_profiles and memberships cascade automatically)`);
  } else {
    log(`   (nothing to delete)`);
  }

  // ── Step 9: Verify ────────────────────────────────────────────────────────

  log("\n🔎  Verifying...");

  const { data: remainingProfiles } = await supabase
    .from("user_profiles")
    .select("id, email, role")
    .in("role", EXTERNAL_ROLES);
  if (remainingProfiles && remainingProfiles.length > 0) {
    log(
      `\n⚠️   ${remainingProfiles.length} external user_profiles still exist ` +
        `(auth deletion may have failed):`
    );
    for (const p of remainingProfiles) {
      log(`     • ${p.email}  [${p.role}]  ${p.id}`);
    }
  } else {
    log("   ✓ No orphan external user_profiles remain");
  }

  const { data: remainingCompanies } = await supabase
    .from("companies")
    .select("id, name");
  if (remainingCompanies && remainingCompanies.length > 0) {
    log(`\n⚠️   ${remainingCompanies.length} companies still exist:`);
    for (const c of remainingCompanies) log(`     • ${c.name}  (${c.id})`);
  } else {
    log("   ✓ No companies remain");
  }

  const { data: remainingProjects } = await supabase
    .from("projects")
    .select("id, job_number");
  if (remainingProjects && remainingProjects.length > 0) {
    log(`\n⚠️   ${remainingProjects.length} projects still exist:`);
    for (const p of remainingProjects) log(`     • ${p.job_number}  (${p.id})`);
  } else {
    log("   ✓ No projects remain");
  }

  if (skippedOptionalTables.size > 0) {
    log(`\n⚠️  Optional tables skipped (not present in this DB):`);
    for (const t of skippedOptionalTables) log(`   • ${t}`);
  }

  log("\n✅  Reset complete.\n");
}

main().catch((err: Error) => {
  console.error(`\n💥  Script failed: ${err.message}\n`);
  process.exit(1);
});
