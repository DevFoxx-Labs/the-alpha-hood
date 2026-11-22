import { describe, expect, it } from "vitest";
import { COOKIE_INVENTORY } from "@/lib/consent/purposes";
import { isPlaceholder, missingLegalFields, readLegalConfig } from "./config";
import { NOTICE_SLUGS, NOTICES, noticeIndex, noticeVersion, renderNotice } from "./index";

const FULL_ENV = {
  LEGAL_ENTITY_NAME: "Alpha Hood Apparel Pvt Ltd",
  LEGAL_REGISTERED_ADDRESS: "1 Test Street, Mumbai 400001",
  LEGAL_GSTIN: "27AAAAA0000A1Z5",
  LEGAL_JURISDICTION_CITY: "Mumbai",
  SUPPORT_EMAIL: "help@example.test",
  SUPPORT_PHONE: "+91 90000 00000",
  SUPPORT_HOURS: "10am–7pm, Mon–Sat",
  PRIVACY_EMAIL: "privacy@example.test",
  GRIEVANCE_OFFICER_NAME: "Test Officer",
  GRIEVANCE_OFFICER_DESIGNATION: "Grievance Officer",
  GRIEVANCE_OFFICER_EMAIL: "grievance@example.test",
  GRIEVANCE_OFFICER_PHONE: "+91 90000 00001",
};

describe("legal notices — one versioned source", () => {
  it("every notice has an ISO version/date and renders in English without unknown tokens", () => {
    for (const slug of NOTICE_SLUGS) {
      expect(NOTICES[slug].version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const rendered = renderNotice(slug, "en");
      expect(rendered?.sections.length).toBeGreaterThan(0);
      expect(JSON.stringify(rendered)).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it("the Privacy Notice covers every DPDP s.5 topic, in English and Hindi with the same sections", () => {
    const required = ["who-we-are", "data-and-purposes", "sharing", "transfers", "retention", "rights", "consent", "grievance", "children", "security", "changes"];
    const en = renderNotice("privacy", "en")!;
    const hi = renderNotice("privacy", "hi")!;
    expect(en.sections.map((s) => s.id)).toEqual(expect.arrayContaining(required));
    expect(hi.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
    expect(JSON.stringify(en)).toContain("Data Protection Board of India");
    expect(JSON.stringify(hi)).toContain("डेटा संरक्षण बोर्ड");
  });

  it("never invents contact facts: missing config renders as a marked placeholder", () => {
    const config = readLegalConfig({});
    expect(isPlaceholder(config.grievanceName)).toBe(true);
    expect(missingLegalFields(config)).toContain("grievanceEmail");
    expect(JSON.stringify(renderNotice("privacy", "en", config))).toContain("[TO BE PROVIDED:");
  });

  it("fills real values from config when provided", () => {
    const config = readLegalConfig(FULL_ENV);
    expect(missingLegalFields(config)).toEqual([]);
    const text = JSON.stringify(renderNotice("terms", "en", config));
    expect(text).toContain("Alpha Hood Apparel Pvt Ltd");
    expect(text).not.toContain("[TO BE PROVIDED:");
  });

  it("formats the ledger notice version as slug@version pairs", () => {
    expect(noticeVersion(["terms", "privacy"])).toBe(`terms@${NOTICES.terms.version};privacy@${NOTICES.privacy.version}`);
  });

  it("the Cookie Policy table lists every cookie in the inventory", () => {
    const text = JSON.stringify(renderNotice("cookies", "en"));
    for (const c of COOKIE_INVENTORY) expect(text).toContain(c.name);
  });

  it("indexes all notices with languages", () => {
    const index = noticeIndex();
    expect(index.map((n) => n.slug).sort()).toEqual([...NOTICE_SLUGS].sort());
    expect(index.find((n) => n.slug === "privacy")?.languages).toEqual(["en", "hi"]);
  });
});
