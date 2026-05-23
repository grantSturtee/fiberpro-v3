"use client";

import { scrollContainerTo } from "@/lib/utils/scroll";

export function RailScrollLink({
  targetId,
  containerId,
  className,
  children,
}: {
  targetId: string;
  containerId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => scrollContainerTo(containerId, targetId)}
      className={className}
    >
      {children}
    </button>
  );
}
