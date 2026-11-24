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
