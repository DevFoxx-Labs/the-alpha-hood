import { describe, expect, it } from "vitest";
import { formatINR, freeShippingProgress, percentOff, rupees } from "./format";

describe("rupees", () => {
  it("converts to integer paise", () => {
    expect(rupees(1299)).toBe(129900);
    expect(rupees(0.1 + 0.2)).toBe(30);
  });
  it("rejects non-finite input", () => {
    expect(() => rupees(Number.NaN)).toThrow(RangeError);
    expect(() => rupees(Infinity)).toThrow(RangeError);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping without decimals for whole rupees", () => {
    expect(formatINR(rupees(1299))).toBe("₹1,299");
    expect(formatINR(rupees(123456))).toBe("₹1,23,456");
    expect(formatINR(0)).toBe("₹0");
  });
  it("shows paise when present", () => {
    expect(formatINR(12345)).toBe("₹123.45");
  });
  it("formats negatives with a minus sign", () => {
    expect(formatINR(-rupees(440))).toBe("−₹440");
  });
  it("refuses fractional paise", () => {
    expect(() => formatINR(10.5)).toThrow(RangeError);
  });
});

describe("percentOff", () => {
  it("rounds down (DESIGN.md §6)", () => {
    expect(percentOff(rupees(1299), rupees(1799))).toBe(27); // 27.79 → 27
    expect(percentOff(rupees(3499), rupees(4999))).toBe(30); // 30.006 → 30
  });
  it("is 0 when there is no discount or MRP is invalid", () => {
    expect(percentOff(rupees(100), rupees(100))).toBe(0);
    expect(percentOff(rupees(120), rupees(100))).toBe(0);
    expect(percentOff(rupees(100), 0)).toBe(0);
  });
});

describe("freeShippingProgress", () => {
  const threshold = rupees(999);
  it("reports remaining amount below the threshold", () => {
    expect(freeShippingProgress(rupees(599), threshold)).toEqual({ remaining: rupees(400), ratio: 599 / 999, unlocked: false });
  });
  it("unlocks at and above the threshold and caps the ratio", () => {
    expect(freeShippingProgress(threshold, threshold).unlocked).toBe(true);
    expect(freeShippingProgress(rupees(5000), threshold)).toEqual({ remaining: 0, ratio: 1, unlocked: true });
  });
});
