import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nextOtpValue, OtpInput } from "./otp-input";

const render = (props: Partial<Parameters<typeof OtpInput>[0]> = {}) =>
  renderToStaticMarkup(createElement(OtpInput, { id: "c", value: "", onChange: () => undefined, ...props }));
const boxes = (html: string) => (html.match(/aspect-\[5\/6\]/g) ?? []).length;

describe("OtpInput — separate boxes per digit", () => {
  it("draws one box per digit: 6 by default, 4 when asked", () => {
    expect(boxes(render())).toBe(6);
    expect(boxes(render({ length: 4 }))).toBe(4);
  });

  it("keeps ONE real input with the platform OTP hints (SMS / email autofill, numeric keypad); boxes are hidden from screen readers", () => {
    const html = render({ value: "12" });
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).toMatch(/autocomplete="one-time-code"/i);
    expect(html).toMatch(/inputmode="numeric"/i);
    expect(html).toMatch(/aria-hidden="true"/);
    expect(html).toContain(">1<");
    expect(html).toContain(">2<");
  });

  it("error: red boxes, shake, aria-invalid; success: green; never shows anything but digits", () => {
    const err = render({ value: "123456", status: "error" });
    expect(err).toContain("otp-shake");
    expect(err).toContain("border-accent");
    expect(err).toMatch(/aria-invalid="true"/);
    expect(render({ value: "123456", status: "success" })).toContain("border-green");
    expect(render({ value: "12ab<script>" })).not.toContain("script");
  });
});

describe("nextOtpValue — typing, paste, autofill, delete", () => {
  it("digits only, capped at the length; spaces / dashes from a pasted code are dropped", () => {
    expect(nextOtpValue("12a3", "", 6)).toEqual({ value: "123", complete: false });
    expect(nextOtpValue("123 456", "", 6)).toEqual({ value: "123456", complete: true });
    expect(nextOtpValue("123-456-789", "", 6)).toEqual({ value: "123456", complete: true });
    expect(nextOtpValue("4821", "", 4)).toEqual({ value: "4821", complete: true });
  });

  it("auto-verify fires once: only when the last digit is ADDED, not when deleting or no change", () => {
    expect(nextOtpValue("12345", "1234", 6)?.complete).toBe(false);
    expect(nextOtpValue("123456", "12345", 6)?.complete).toBe(true);
    expect(nextOtpValue("12345", "123456", 6)).toEqual({ value: "12345", complete: false }); // backspace
    expect(nextOtpValue("123456", "123456", 6)).toBeNull(); // nothing changed
    expect(nextOtpValue("1234567", "123456", 6)).toBeNull(); // full: extra digit ignored…
  });

  it("…except after a wrong code: one more digit starts a fresh code", () => {
    expect(nextOtpValue("1234567", "123456", 6, "error")).toEqual({ value: "7", complete: false });
  });
});
