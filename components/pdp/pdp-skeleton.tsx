import { Skeleton } from "@/components/ui/skeleton";

/**
 * PDP fallback while the product (and its `params`) resolve — same grid as ProductDetail
 * (gallery | 480/520 px panel) so the page doesn't jump when it streams in.
 */
export function PdpSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-[1440px] lg:mt-4 lg:px-10">
      <Skeleton className="mx-10 mt-5 hidden h-3 w-56 lg:block" />
      <div className="lg:mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
          <Skeleton className="aspect-[3/4] w-full" />
          <Skeleton className="hidden aspect-[3/4] w-full lg:block" />
        </div>
        <div className="px-4 pt-5 lg:px-0 lg:pt-0">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="mt-3 h-7 w-40" />
          <Skeleton className="mt-2 h-3 w-32" />
          <div className="mt-6 flex gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="size-11" />
            ))}
          </div>
          <Skeleton className="mt-6 h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
