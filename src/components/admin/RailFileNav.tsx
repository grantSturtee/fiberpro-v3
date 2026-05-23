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
    <div className="space-y-1 text-xs">
      {items.map(({ label, count, targetId }) => (
        <button
          key={targetId}
          type="button"
          onClick={() => scrollContainerTo(containerId, targetId)}
          className="w-full flex justify-between items-center py-0.5 text-dim hover:text-primary transition-colors group text-left"
        >
          <span>{label}</span>
          <span className="font-medium text-ink group-hover:text-primary">{count}</span>
        </button>
      ))}
    </div>
  );
}
