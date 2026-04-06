type SectionCardProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPad?: boolean; // allow the consumer to manage internal padding
  id?: string;     // HTML anchor id, used for in-page links (e.g. settings#tcd-library)
};

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  noPad = false,
  id,
}: SectionCardProps) {
  return (
    <div
      id={id}
      className={`bg-card rounded-xl ${className}`}
      style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-muted">{description}</p>
            )}
          </div>
          {action && (
            <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
          )}
        </div>
      )}
      <div className={noPad ? "" : title || action ? "px-6 pb-6" : "p-6"}>
        {children}
      </div>
    </div>
  );
}
