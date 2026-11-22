import { cn } from "@/lib/utils";

/** DESIGN.md §3 Skeletons: `soft` blocks, subtle 1.2 s shimmer, square corners. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "animate-shimmer bg-soft bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.65)_50%,transparent_100%)] bg-size-[200%_100%] bg-no-repeat",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
