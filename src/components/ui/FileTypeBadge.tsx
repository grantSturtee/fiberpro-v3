import { getFileTypeLabel } from "@/lib/constants/files";

/**
 * Compact file-type badge for file rows.
 * Derives the label from the filename extension and applies a type-aware color.
 * Server-safe — no client interactivity.
 */
export function FileTypeBadge({ fileName }: { fileName: string }) {
  const label = getFileTypeLabel(fileName);

  let bg: string;
  let color: string;

  if (label === "PDF") {
    bg = "bg-red-50";
    color = "text-red-600";
  } else if (label === "FILE") {
    bg = "bg-[#f0f2f4]";
    color = "text-muted";
  } else {
    // PNG, JPG, JPEG, WEBP, GIF, SVG
    bg = "bg-blue-50";
    color = "text-blue-600";
  }

  return (
    <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${bg}`}>
      <span className={`text-[9px] font-bold tracking-tight ${color}`}>{label}</span>
    </div>
  );
}
