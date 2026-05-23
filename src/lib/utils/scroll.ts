/**
 * Scroll a named container so that a target element is at its top edge.
 *
 * Uses getBoundingClientRect() + container.scrollTo() rather than
 * scrollIntoView(). scrollIntoView() walks the full ancestor chain and also
 * calls scrollTo() on overflow:hidden ancestors, which produces jump/stuck
 * behavior in layouts where the scroll container is a nested overflow-y-auto
 * element (as on the admin project detail page).
 */
export function scrollContainerTo(containerId: string, targetId: string): void {
  const container = document.getElementById(containerId);
  const target = document.getElementById(targetId);
  if (!container || !target) return;

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  container.scrollTo({
    top: container.scrollTop + (targetRect.top - containerRect.top),
    behavior: "smooth",
  });
}
