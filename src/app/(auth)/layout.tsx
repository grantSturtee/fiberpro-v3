// Auth layout: minimal, full-viewport, centered.
// No sidebar, no navigation chrome.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      {children}
    </div>
  );
}
