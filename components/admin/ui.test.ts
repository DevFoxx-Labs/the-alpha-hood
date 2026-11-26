import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AButton } from "./ui";

/** Regression: `asChild` used to pass the spinner slot as a second child, and Radix Slot threw (Reports export link). */
describe("AButton", () => {
  it("asChild renders the single child with button styles (no Slot error)", () => {
    const html = renderToStaticMarkup(h(AButton, { asChild: true, variant: "outline" }, h("a", { href: "/x", download: true }, "Export orders CSV")));
    expect(html).toMatch(/^<a [^>]*href="\/x"/);
    expect(html).toContain("Export orders CSV");
    expect(html).toContain("border-input"); // outline variant applied to the link
    expect(html).not.toContain("<button");
  });
  it("as a button it shows the spinner while loading and is disabled", () => {
    const html = renderToStaticMarkup(h(AButton, { loading: true }, "Save"));
    expect(html).toMatch(/^<button[^>]*disabled/);
    expect(html).toContain("animate-spin");
  });
});

describe("admin navigation", () => {
  it("Settings is the last item, owner only, and every screen is reachable from the five mobile tabs", async () => {
    const { NAV_CONFIG } = await import("./nav");
    const { mobileSections } = await import("./admin-shell");
    const { ROLES } = await import("@/lib/admin/permissions");
    for (const role of ROLES) {
      const nav = NAV_CONFIG[role];
      const leaves = nav.filter((i) => !("type" in i)) as { label: string; route: string }[];
      expect(leaves.some((l) => l.route === "/admin/settings"), role).toBe(role === "owner");
      const sections = nav.reduce<{ label: string; items: never[] }[]>((acc, item) => {
        if ("type" in item) acc.push({ label: item.label, items: [] });
        else if (acc.length === 0) acc.push({ label: item.label, items: [item as never] });
        else acc.at(-1)!.items.push(item as never);
        return acc;
      }, []);
      const tabs = mobileSections(sections);
      expect(tabs.length, role).toBeLessThanOrEqual(5);
      expect(tabs.flatMap((t) => t.items).length, role).toBe(leaves.length);
    }
    expect((NAV_CONFIG.owner.at(-1) as { label: string }).label).toBe("Settings");
    expect((NAV_CONFIG.owner[0] as { label: string }).label).toBe("Dashboard");
  });
});
