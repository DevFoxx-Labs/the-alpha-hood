import { describe, expect, it } from "vitest";
import { devPagesEnabled } from "./dev-tools";

describe("devPagesEnabled — fail closed", () => {
  it("is on outside production", () => {
    expect(devPagesEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(devPagesEnabled({ NODE_ENV: "test" })).toBe(true);
  });
  it("is off in production unless ENABLE_DEV_PAGES is exactly 'true'", () => {
    expect(devPagesEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(devPagesEnabled({ NODE_ENV: "production", ENABLE_DEV_PAGES: "1" })).toBe(false);
    expect(devPagesEnabled({ NODE_ENV: "production", ENABLE_DEV_PAGES: "TRUE" })).toBe(false);
    expect(devPagesEnabled({ NODE_ENV: "production", ENABLE_DEV_PAGES: "true" })).toBe(true);
  });
});
