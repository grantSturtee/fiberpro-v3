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
    bg = "bg-[#DC2626]";
    color = "text-white";
  } else if (label === "FILE") {
    bg = "bg-[#F3F4F6]";
    color = "text-[#6B7280]";
  } else {
    // PNG, JPG, JPEG, WEBP, GIF, SVG
    bg = "bg-[#EFF6FF]";
    color = "text-[#1565C0]";
  }

  return (
    <div className={`w-7 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${bg}`}>
      <span className={`text-[9px] font-bold tracking-tight ${color}`}>{label}</span>
    </div>
  );
}
