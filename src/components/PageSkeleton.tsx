export default function PageSkeleton() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-16 flex-col items-center py-4 gap-4 border-r border-border bg-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
      {/* Content skeleton */}
      <div className="flex-1 p-6 space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted animate-pulse" />
          <div className="h-4 w-64 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  );
}
