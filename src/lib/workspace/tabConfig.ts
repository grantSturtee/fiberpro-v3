// Centralized workspace tab configuration.
// Add new tabs here; role access is defined in TAB_ACCESS below.

export const WORKSPACE_TABS = [
  { id: "intake",     label: "Intake" },
  { id: "setup",      label: "Setup" },
  { id: "design",     label: "Design" },
  { id: "package",    label: "Package" },
  { id: "submission", label: "Submission" },
  { id: "billing",    label: "Billing" },
  { id: "activity",   label: "Activity" },
] as const;

export type WorkspaceTab = typeof WORKSPACE_TABS[number]["id"];
export const VALID_TABS = WORKSPACE_TABS.map((t) => t.id) as WorkspaceTab[];

// Tabs accessible to each role (non-listed roles fall back to DEFAULT_ACCESS).
// Expanding designer access later: add tab ids to the "designer" array.
const TAB_ACCESS: Record<string, WorkspaceTab[]> = {
  admin:    ["intake", "setup", "design", "package", "submission", "billing", "activity"],
  designer: ["intake", "setup", "design", "package", "activity"],
};

const DEFAULT_ACCESS: WorkspaceTab[] = ["intake", "activity"];

export function getAccessibleTabs(role: string): WorkspaceTab[] {
  return TAB_ACCESS[role] ?? DEFAULT_ACCESS;
}

export function isTabLocked(tabId: WorkspaceTab, role: string): boolean {
  return !getAccessibleTabs(role).includes(tabId);
}

// Param stays `string` so legacy callers still passing ProjectStatus values
// don't break the type signature during the migration. Unknown/legacy values
// fall through to "intake" (same default behavior as before).
export function defaultTabForStatus(status: string): WorkspaceTab {
  switch (status) {
    case "new_project":
    case "cancelled":
      return "intake";
    case "in_production":
    case "pending_review":
      return "design";
    case "billing_ready":
    case "invoice_sent":
      return "package";
    case "sub_bill_now":
    case "permit_billed":
    case "paid_complete":
      return "submission";
    default:
      return "intake";
  }
}

/**
 * Resolves the active tab for a given role, falling back gracefully when the
 * requested tab is locked or invalid.
 *
 * Fallback order:
 *  1. Requested tab (if valid and accessible)
 *  2. Status-based default (if accessible)
 *  3. First accessible tab
 */
export function resolveActiveTab(
  requestedTab: string | undefined,
  role: string,
  status: string,
): WorkspaceTab {
  const accessible = getAccessibleTabs(role);

  if (requestedTab && (VALID_TABS as string[]).includes(requestedTab) && accessible.includes(requestedTab as WorkspaceTab)) {
    return requestedTab as WorkspaceTab;
  }

  const statusDefault = defaultTabForStatus(status);
  if (accessible.includes(statusDefault)) {
    return statusDefault;
  }

  return accessible[0] ?? "setup";
}
