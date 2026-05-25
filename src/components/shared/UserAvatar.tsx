// Shared avatar component for internal users (admin, designer, company).
// Renders profile photo when available; falls back to initials badge with
// brand-blue background and white initials per design.md.

type Size = "xs" | "sm" | "md" | "lg";

type Props = {
  displayName: string;
  avatarUrl?: string | null;
  size?: Size;
};

const SIZE_MAP: Record<Size, { px: number; textClass: string }> = {
  xs: { px: 20, textClass: "text-[8px]" },
  sm: { px: 28, textClass: "text-[10px]" },
  md: { px: 36, textClass: "text-xs" },
  lg: { px: 48, textClass: "text-sm" },
};

function getInitials(displayName: string): string {
  return displayName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserAvatar({ displayName, avatarUrl, size = "sm" }: Props) {
  const { px, textClass } = SIZE_MAP[size];
  const dim = { width: px, height: px };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName}
        className="rounded-full object-cover flex-shrink-0"
        style={dim}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ ...dim, background: "#1565C0" }}
    >
      <span className={`${textClass} font-semibold text-white`}>
        {getInitials(displayName)}
      </span>
    </div>
  );
}
