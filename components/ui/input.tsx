import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 border border-input bg-white px-4 text-[14px] text-ink placeholder:text-muted outline-none transition-colors focus-visible:border-black focus-visible:outline-none aria-invalid:border-accent disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
