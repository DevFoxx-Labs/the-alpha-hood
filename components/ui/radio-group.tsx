"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />;
}

/** Selectable card (address, delivery speed): 1 px line border; 2 px black border when selected. */
function RadioCard({ className, children, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        "group relative w-full border border-line bg-white p-4 text-left outline-offset-2 transition-colors hover:border-ink-2 data-[state=checked]:border-2 data-[state=checked]:border-black data-[state=checked]:p-[15px]",
        className,
      )}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}

/** The round radio dot shown inside a RadioCard. Rounded by design (form control affordance). */
function RadioDot() {
  return (
    <span
      aria-hidden="true"
      className="grid size-5 place-items-center rounded-full border-[1.5px] border-[#9a9a9a] group-data-[state=checked]:border-black"
    >
      <span className="size-2.5 rounded-full bg-black opacity-0 group-data-[state=checked]:opacity-100" />
    </span>
  );
}

export { RadioCard, RadioDot, RadioGroup };
