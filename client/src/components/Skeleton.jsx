/**
 * Reusable loading skeleton components for the admin panel.
 *
 * Usage:
 *   import { CardSkeleton, TableSkeleton, StatsSkeleton } from '../components/Skeleton';
 *   if (isLoading) return <TableSkeleton rows={5} cols={4} />;
 */

function Pulse({ className = '', style }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} style={style} />;
}

/** Single stat card skeleton */
export function StatSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <Pulse className="h-3 w-20 mb-3" />
      <Pulse className="h-8 w-16 mb-2" />
      <Pulse className="h-2 w-24" />
    </div>
  );
}

/** Row of stat card skeletons */
export function StatsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <StatSkeleton key={i} />)}
    </div>
  );
}

/** Generic card skeleton */
export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
      <Pulse className="h-4 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Pulse key={i} className="h-3 w-full" style={{ width: `${80 - i * 10}%` }} />
      ))}
    </div>
  );
}

/** Table skeleton */
export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Pulse key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-gray-50 px-4 py-3.5 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Pulse key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** List skeleton (e.g. recent enquiries) */
export function ListSkeleton({ items = 4 }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
      <Pulse className="h-4 w-40 mb-2" />
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Pulse className="h-9 w-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Pulse className="h-3 w-3/4" />
            <Pulse className="h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full page skeleton combining stats + table */
export function PageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <Pulse className="h-7 w-48 mb-2" />
      <StatsSkeleton count={4} />
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}

export default { StatSkeleton, StatsSkeleton, CardSkeleton, TableSkeleton, ListSkeleton, PageSkeleton };
