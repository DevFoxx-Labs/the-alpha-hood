import { cn } from "@/lib/utils";

/** DESIGN.md §2.3 product grid: 2 cols 8/16 px gaps on mobile, 4 cols 18/28 px gaps on desktop. */
export function ProductGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-2 gap-y-4 lg:grid-cols-4 lg:gap-x-[18px] lg:gap-y-7", className)}>
      {children}
    </div>
  );
}
