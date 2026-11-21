// Loading placeholders shaped like what's coming, so the page doesn't jump.

function Bar({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted motion-reduce:animate-none ${className}`}
      style={style}
    />
  );
}

export function TrackerSkeleton() {
  return (
    <output
      aria-label="Loading your applications"
      className="block flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <Bar className="h-5 w-40" />
      <Bar className="h-4 w-56" />
      <div className="flex gap-1.5 pt-2">
        {[48, 64, 72, 80, 60, 76].map((w) => (
          <Bar key={w} className="h-6 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="flex flex-col divide-y pt-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Bar className="h-4 w-20" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-8" />
            <Bar className="hidden h-8 w-24 sm:block" />
            <Bar className="hidden h-8 w-28 sm:block" />
          </div>
        ))}
      </div>
    </output>
  );
}

export function JobSkeleton() {
  return (
    <output aria-label="Loading job" className="block flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
        <Bar className="h-6 w-2/3" />
        <Bar className="h-4 w-1/3" />
        <div className="flex gap-2 pt-1">
          <Bar className="h-5 w-16 rounded-full" />
          <Bar className="h-5 w-20 rounded-full" />
          <Bar className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <Bar className="h-8 w-44" />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
        <Bar className="h-5 w-32" />
        <Bar className="h-10 w-24" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
        <Bar className="h-4 w-4/6" />
      </div>
    </output>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <output
      aria-label="Loading"
      className="block flex flex-col gap-3 rounded-xl border bg-card p-6"
    >
      <Bar className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => 90 - i * 12).map((width) => (
        <Bar key={width} className="h-4" style={{ width: `${width}%` }} />
      ))}
    </output>
  );
}
