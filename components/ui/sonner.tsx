"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * DESIGN.md §3 Toast: black bar bottom-centre (mobile: above the 78 px tab bar), white text.
 * Content is rendered with `toast.custom` (see components/store/toast.tsx).
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      offset={{ bottom: 24 }}
      mobileOffset={{ bottom: 90 }}
      gap={8}
      toastOptions={{ unstyled: true, className: "w-full" }}
      {...props}
    />
  );
}

export { Toaster };
