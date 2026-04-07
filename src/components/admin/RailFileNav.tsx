"use client";

/**
 * Right-rail file summary nav links.
 * Uses scrollIntoView() so the click scrolls the left column's scroll container,
 * not the window (which standard href="#id" would target).
 */

type NavItem = {
  label: string;
  count: number;
  targetId: string;
};

export function RailFileNav({ items }: { items: NavItem[] }) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-1 text-xs">
      {items.map(({ label, count, targetId }) => (
        <button
          key={targetId}
          type="button"
          onClick={() => scrollTo(targetId)}
          className="w-full flex justify-between items-center py-0.5 text-dim hover:text-primary transition-colors group text-left"
        >
          <span>{label}</span>
          <span className="font-medium text-ink group-hover:text-primary">{count}</span>
        </button>
      ))}
    </div>
  );
}
