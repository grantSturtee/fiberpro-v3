import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import {
  UpdatesFeed,
  type UpdateFeedRow,
  type AuthorInfo,
  type InternalUser,
} from "@/components/admin/UpdatesFeed";
import {
  NeedsUpdateSection,
  type StaleProject,
} from "@/components/admin/NeedsUpdateSection";
import {
  ACTIVE_STATUSES,
  isUpdateStale,
  firstJobNameSegment,
} from "@/lib/utils/projectUpdateStatus";
import { getUpdateCadenceDays } from "@/lib/queries/appSettings";

export const metadata: Metadata = { title: "Updates" };

type RangeKey = "all" | "today" | "3days";
const VALID_RANGES: RangeKey[] = ["all", "today", "3days"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const { range = "all" } = await searchParams;
  const activeRange: RangeKey = VALID_RANGES.includes(range as RangeKey)
    ? (range as RangeKey)
    : "all";

  // Build date cutoff for feed range filter
  let cutoff: string | null = null;
  if (activeRange === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    cutoff = d.toISOString();
  } else if (activeRange === "3days") {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    d.setHours(0, 0, 0, 0);
    cutoff = d.toISOString();
  }

  let updatesQuery = supabase
    .from("project_updates")
    .select(
      "id, body, status, created_by, created_at, project_id, projects(job_name, job_number, companies(name))"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (cutoff) {
    updatesQuery = updatesQuery.gte("created_at", cutoff);
  }

  // ── All queries in parallel ───────────────────────────────────────────────

  const [
    { data: updatesData, error: updatesError },
    { data: internalUsersData },
    { data: activeProjectsData },
    { data: latestUpdatesData },
    staleDays,
  ] = await Promise.all([
    updatesQuery,

    // Internal user profiles — used for feed author display AND designer names
    supabase
      .from("user_profiles")
      .select("id, display_name, avatar_url")
      .in("role", ["admin", "designer"])
      .order("display_name", { ascending: true }),

    // Active projects for the "Needs Update" section
    supabase
      .from("projects")
      .select("id, job_number, job_name, status, assigned_designer_id, companies(name)")
      .in("status", [...ACTIVE_STATUSES])
      .order("job_number", { ascending: true }),

    // Latest update timestamp per project (unfiltered — staleness check ignores range)
    supabase
      .from("project_updates")
      .select("project_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),

    // Configured update cadence (falls back to 3 days if not set)
    getUpdateCadenceDays(supabase),
  ]);

  if (updatesError) {
    console.error("Failed to load updates:", updatesError.message);
  }

  const rawUpdates       = updatesData       ?? [];
  const internalProfileList = internalUsersData ?? [];

  // ── Sign avatar URLs ───────────────────────────────────────────────────────

  const avatarPaths = internalProfileList
    .map((p) => (p as { id: string; display_name: string; avatar_url?: string | null }).avatar_url)
    .filter((v): v is string => !!v);

  const signedAvatarMap: Record<string, string> = {};
  if (avatarPaths.length > 0) {
    const { data: signedList } = await supabase.storage
      .from("avatars")
      .createSignedUrls(avatarPaths, 3600);
    for (const entry of signedList ?? []) {
      if (entry.signedUrl && entry.path) signedAvatarMap[entry.path] = entry.signedUrl;
    }
  }

  // ── Build authorMap ────────────────────────────────────────────────────────

  const authorMap: Record<string, AuthorInfo> = {};
  for (const p of internalProfileList) {
    const profile = p as { id: string; display_name: string; avatar_url?: string | null };
    const rawPath = profile.avatar_url ?? null;
    authorMap[profile.id] = {
      displayName: profile.display_name ?? "Unknown",
      avatarUrl: rawPath ? (signedAvatarMap[rawPath] ?? null) : null,
    };
  }

  for (const update of rawUpdates) {
    if (update.created_by && !authorMap[update.created_by]) {
      console.warn(
        `project_updates: no user_profile for created_by="${update.created_by}" (update id: ${update.id})`
      );
    }
  }

  // ── Shape feed rows ────────────────────────────────────────────────────────

  const rows: UpdateFeedRow[] = rawUpdates.map((update) => {
    const project = update.projects as unknown as {
      job_name: string;
      job_number: string | null;
      companies: { name: string } | null;
    } | null;

    return {
      id: update.id,
      body: (update as Record<string, unknown>).body as string | null,
      status: (update as Record<string, unknown>).status as string | null,
      created_by: update.created_by,
      created_at: update.created_at,
      project_id: update.project_id,
      jobNumber: project?.job_number ?? null,
      jobName: project?.job_name ?? "Unknown Project",
      companyName: project?.companies?.name ?? null,
    };
  });

  const internalUsers: InternalUser[] = internalProfileList.map((p) => ({
    id: p.id,
    displayName: p.display_name ?? "Unknown",
  }));

  // ── Build latestUpdateMap: project_id → most recent created_at ────────────

  const latestUpdateMap = new Map<string, string>();
  for (const row of latestUpdatesData ?? []) {
    if (!latestUpdateMap.has(row.project_id)) {
      latestUpdateMap.set(row.project_id, row.created_at);
    }
  }

  // ── Build stale projects list ─────────────────────────────────────────────

  // Designer name lookup reuses internalProfileList (designers are included)
  const designerNameMap: Record<string, string> = {};
  for (const p of internalProfileList) {
    designerNameMap[p.id] = p.display_name ?? "Unknown";
  }

  const staleProjects: StaleProject[] = (activeProjectsData ?? [])
    .filter((p) => isUpdateStale(latestUpdateMap.get(p.id) ?? null, staleDays))
    .map((p) => {
      const co = p.companies as unknown as { name: string } | null;
      return {
        id: p.id,
        jobNumber: p.job_number as string,
        jobName: firstJobNameSegment(p.job_name as string),
        companyName: co?.name ?? null,
        designerId: p.assigned_designer_id as string | null,
        designerName: p.assigned_designer_id
          ? (designerNameMap[p.assigned_designer_id as string] ?? null)
          : null,
        status: p.status as string,
        lastUpdateAt: latestUpdateMap.get(p.id) ?? null,
      };
    })
    // Sort: no updates first, then oldest-updated first
    .sort((a, b) => {
      if (!a.lastUpdateAt && b.lastUpdateAt) return -1;
      if (a.lastUpdateAt && !b.lastUpdateAt) return 1;
      if (!a.lastUpdateAt || !b.lastUpdateAt) return 0;
      return a.lastUpdateAt < b.lastUpdateAt ? -1 : 1;
    });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Updates"
        subtitle="All project status updates"
      />

      <NeedsUpdateSection projects={staleProjects} staleDays={staleDays} />

      <UpdatesFeed
        rows={rows}
        authorMap={authorMap}
        internalUsers={internalUsers}
        activeRange={activeRange}
      />
    </div>
  );
}
