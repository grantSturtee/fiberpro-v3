/**
 * Format a date string (ISO 8601 or date-only) to a human-readable label.
 * e.g. "2026-04-05" → "Apr 5, 2026"
 * Returns "—" for null/undefined.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value + (value.length === 10 ? "T12:00:00Z" : ""));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Format an ISO timestamp to a human-readable date + time label (local timezone).
 * e.g. "2026-04-05T14:34:00Z" → "Apr 5, 2026, 2:34 PM"
 * Used for version labels where closeness in time matters.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Capitalize first letter; replace underscores with spaces.
 * e.g. "in_design" → "In design"
 */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
