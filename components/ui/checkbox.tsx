"use client";

import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Square checkbox; checked = black inner square (reference/02 filter list). */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-4 shrink-0 place-items-center border border-[#bdbdbd] bg-white data-[state=checked]:border-black",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="block size-2 bg-black" />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
