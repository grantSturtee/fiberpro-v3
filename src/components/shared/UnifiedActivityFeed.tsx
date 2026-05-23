import { UPDATE_STATUS_META, type UpdateStatus } from "@/lib/utils/projectUpdateStatus";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { PostUpdateForm } from "@/components/admin/PostUpdateForm";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusEntry = {
  id: string;
  status: string | null;
  body: string | null;
  created_by: string;
  created_at: string;
};

type ActivityEntry = {
  id: string;
  action: string;
  actor_label: string | null;
  created_at: string;
};

type FeedItem =
  | ({ kind: "status" } & StatusEntry)
  | ({ kind: "activity" } & ActivityEntry);

// ── Deduplication ─────────────────────────────────────────────────────────────

function isSuppressedActivity(action: string): boolean {
  return (
    action === "Design approved" ||
    action === "Submitted TCP sheets for admin review" ||
    action.startsWith("Revisions requested") ||
    action.startsWith("Submitted to authority")
  );
}

// ── Timestamp helpers ─────────────────────────────────────────────────────────

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function feedDate(iso: string): string {
  if (isToday(iso)) {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function feedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Stale warning ─────────────────────────────────────────────────────────────

function StaleWarning({ dayCount }: { dayCount: number | null }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-amber-700"
      style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8 2L14 13H2L8 2z" />
        <line x1="8" y1="7" x2="8" y2="10" />
        <circle cx="8" cy="12" r="0.5" fill="currentColor" />
      </svg>
      <span>
        {dayCount === null
          ? "No status updates yet — post the first one below."
          : `No status update in ${dayCount} day${dayCount === 1 ? "" : "s"}.`}
      </span>
    </div>
  );
}

// ── Timestamp cell ────────────────────────────────────────────────────────────

function TimestampCell({ iso }: { iso: string }) {
  const older = !isToday(iso);
  return (
    <div className="flex-shrink-0 text-right min-w-[3.5rem]">
      <p className="text-[11px] text-muted leading-tight">{feedDate(iso)}</p>
      {older && (
        <p className="text-[10px] text-faint invisible group-hover:visible leading-tight">
          {feedTime(iso)}
        </p>
      )}
    </div>
  );
}

// ── Feed merge helper ─────────────────────────────────────────────────────────

function buildFeedItems(
  projectUpdates: StatusEntry[],
  activity: ActivityEntry[]
): FeedItem[] {
  const statusItems: FeedItem[] = projectUpdates.map((u) => ({
    kind: "status" as const,
    ...u,
  }));
  const activityItems: FeedItem[] = activity
    .filter((a) => !isSuppressedActivity(a.action))
    .map((a) => ({ kind: "activity" as const, ...a }));
  return [...statusItems, ...activityItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// ── Row renderers ─────────────────────────────────────────────────────────────

function FeedRows({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">No activity recorded yet.</p>;
  }
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        if (item.kind === "status") {
          const meta = item.status
            ? (UPDATE_STATUS_META[item.status as UpdateStatus] ?? null)
            : null;
          return (
            <div key={`s-${item.id}`} className="group flex items-stretch gap-2 px-1 py-1.5">
              <div
                className="w-0.5 flex-shrink-0 rounded-full"
                style={{ background: meta?.barColor ?? "#d1d5db" }}
                aria-hidden
              />
              <div className="flex-shrink-0 w-28">
                <p
                  className="text-[11px] font-bold leading-tight"
                  style={{ color: meta?.color ?? "#6b7280" }}
                >
                  {meta?.label ?? "Update"}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <UserAvatar displayName={item.created_by} size="xs" />
                  <p className="text-[11px] text-muted truncate">{item.created_by}</p>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {item.body && (
                  <p className="text-sm text-ink whitespace-pre-wrap leading-snug">
                    {item.body}
                  </p>
                )}
              </div>
              <TimestampCell iso={item.created_at} />
            </div>
          );
        }

        const actor = item.actor_label ?? "System";
        return (
          <div key={`a-${item.id}`} className="group flex items-start gap-2 px-1 py-1.5">
            <div className="flex-shrink-0 w-32">
              <div className="flex items-center gap-1">
                <UserAvatar displayName={actor} size="xs" />
                <p className="text-[11px] text-muted truncate">{actor}</p>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink leading-snug">{item.action}</p>
            </div>
            <TimestampCell iso={item.created_at} />
          </div>
        );
      })}
    </div>
  );
}

// ── Public exports ────────────────────────────────────────────────────────────

/** Composer only: stale warning + PostUpdateForm. Used in pinned-header Activity layout. */
export function ActivityComposer({
  projectId,
  revalidatePath,
  stale = false,
  staleDayCount,
}: {
  projectId: string;
  revalidatePath: string;
  stale?: boolean;
  staleDayCount?: number | null;
}) {
  return (
    <div className="space-y-3">
      {stale && <StaleWarning dayCount={staleDayCount ?? null} />}
      <PostUpdateForm projectId={projectId} revalidatePath={revalidatePath} stale={stale} />
    </div>
  );
}

/** Feed rows only: merged, sorted, deduplicated. Used below the pinned composer. */
export function ActivityFeedList({
  projectUpdates,
  activity,
}: {
  projectUpdates: StatusEntry[];
  activity: ActivityEntry[];
}) {
  const items = buildFeedItems(projectUpdates, activity);
  return <FeedRows items={items} />;
}

/** Combined composer + feed. Used when the whole section scrolls together. */
export function UnifiedActivityFeed({
  projectId,
  revalidatePath,
  projectUpdates,
  activity,
  stale = false,
  staleDayCount,
  showComposer = true,
}: {
  projectId: string;
  revalidatePath: string;
  projectUpdates: StatusEntry[];
  activity: ActivityEntry[];
  stale?: boolean;
  staleDayCount?: number | null;
  showComposer?: boolean;
}) {
  const allItems = buildFeedItems(projectUpdates, activity);

  return (
    <div className="space-y-4">
      {stale && showComposer && <StaleWarning dayCount={staleDayCount ?? null} />}
      {showComposer && (
        <PostUpdateForm
          projectId={projectId}
          revalidatePath={revalidatePath}
          stale={stale}
        />
      )}
      {allItems.length > 0 && (
        <div
          className="space-y-0.5"
          style={{ borderTop: "1px solid #e3e9ec", paddingTop: "0.75rem" }}
        >
          <FeedRows items={allItems} />
        </div>
      )}
      {allItems.length === 0 && (
        <p className="text-sm text-muted">No activity recorded yet.</p>
      )}
    </div>
  );
}
