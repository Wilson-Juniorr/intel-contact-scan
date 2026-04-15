export function FunnelSkeleton() {
  return (
    <div className="flex-1 flex gap-0 overflow-hidden">
      {Array.from({ length: 6 }).map((_, colIdx) => (
        <div key={colIdx} className="flex-1 min-w-[240px] max-w-[290px] flex flex-col">
          {/* Header skeleton */}
          <div className="px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full skeleton-shimmer" />
              <div className="h-3 w-24 rounded skeleton-shimmer" />
              <div className="ml-auto h-4 w-6 rounded-full skeleton-shimmer" />
            </div>
          </div>
          {/* Card skeletons */}
          <div className="flex-1 px-1.5 py-1.5 space-y-1.5">
            {Array.from({ length: 3 - (colIdx % 2) }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="mx-1 rounded-lg border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="h-4 w-32 rounded skeleton-shimmer" />
                  <div className="h-4 w-8 rounded skeleton-shimmer" />
                </div>
                <div className="h-3 w-20 rounded skeleton-shimmer" />
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full skeleton-shimmer" />
                  <div className="h-3 w-24 rounded skeleton-shimmer" />
                </div>
                <div className="h-1 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
          {/* Footer skeleton */}
          <div className="px-3 py-2 border-t border-border space-y-1">
            <div className="h-2.5 w-full rounded skeleton-shimmer" />
            <div className="h-2.5 w-3/4 rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}
