"use client";

import { scrollContainerTo } from "@/lib/utils/scroll";

type NavItem = {
  label: string;
  count: number;
  targetId: string;
};

export function RailFileNav({
  items,
  containerId,
}: {
  items: NavItem[];
  containerId: string;
}) {
  return (
    <div className="space-y-0.5">
      {items.map(({ label, count, targetId }) => (
        <button
          key={targetId}
          type="button"
          onClick={() => scrollContainerTo(containerId, targetId)}
          className="w-full flex justify-between items-center gap-2 px-2 py-1 rounded-md text-[12px] text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] transition-colors text-left group"
        >
          <span className="truncate">{label}</span>
          <span className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-[#F3F4F6] text-[#6B7280] group-hover:bg-white">
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}
