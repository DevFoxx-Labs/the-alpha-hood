import { Skeleton } from "@/components/ui/skeleton";

/** Fallback for text pages (legal notices, help) while `params` resolve — same 860 px column as the page. */
export function TextPageSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-6 h-10 w-2/3" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-5/6" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
