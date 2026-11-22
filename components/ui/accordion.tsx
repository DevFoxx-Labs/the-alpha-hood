"use client";

import { Add01Icon, MinusSignIcon } from "@hugeicons/core-free-icons";
import { Accordion as AccordionPrimitive } from "radix-ui";
import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** DESIGN.md §3 Accordion: uppercase 700 13 px rows with +/−, line dividers, 14 px/1.7 content. */
function Accordion(props: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn("border-b border-line", className)} {...props} />;
}

function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex flex-1 items-center justify-between gap-4 py-4 text-left text-[12.5px] font-bold uppercase tracking-[0.12em] lg:text-[13px]",
          className,
        )}
        {...props}
      >
        {children}
        <Icon icon={Add01Icon} size={16} className="group-data-[state=open]:hidden" />
        <Icon icon={MinusSignIcon} size={16} className="hidden group-data-[state=open]:block" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("type-body pb-5", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
