import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/** DESIGN.md §3 Button: square, uppercase 700 label, 48 px (lg 54, sm 36). */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border-[1.5px] font-bold uppercase tracking-[0.12em] transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-black bg-black text-white hover:bg-ink-2 hover:border-ink-2",
        outline: "border-black bg-white text-black hover:bg-soft",
        "on-dark": "border-white bg-white text-black hover:bg-soft-2 hover:border-soft-2",
        volt: "border-volt bg-volt text-black hover:brightness-95",
        ghost: "border-transparent bg-transparent text-ink hover:bg-soft",
        link: "h-auto border-0 px-0 underline underline-offset-4 tracking-[0.1em] hover:text-ink-2",
      },
      size: {
        sm: "h-9 px-3.5 text-[11.5px]",
        md: "h-12 px-6 text-[12px] lg:text-[13px]",
        lg: "h-[54px] px-7 text-[13px] lg:text-[14px]",
        icon: "size-12 p-0",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0 text-[11.5px]" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

function Button({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          <span className="sr-only">Loading</span>
          <span aria-hidden="true">{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
