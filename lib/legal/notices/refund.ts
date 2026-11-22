import type { Notice } from "../types";

/**
 * Refund & Cancellation Policy (PRD ORD-04, RET-01…04). Commercial values come from lib/config/store.ts
 * and are demo values until the owner confirms them. DRAFT: lawyer review before launch.
 */
export const REFUND_NOTICE: Notice = {
  slug: "refund-cancellation",
  version: "2026-11-22",
  lastUpdated: "2026-11-22",
  text: {
    en: {
      title: "Refund & Cancellation Policy",
      summary: "How to cancel an order, return or exchange an item, and when you get your money back.",
      sections: [
        {
          id: "cancel",
          heading: "1. Cancelling an order",
          blocks: [
            {
              type: "list",
              items: [
                "You can cancel from your account (or by contacting us) until the order is packed. There is no cancellation fee.",
                "After it is packed, you can refuse delivery or request a return once delivered.",
                "If we cancel your order (for example, if an item is out of stock), we tell you and refund any amount paid in full.",
              ],
            },
          ],
        },
        {
          id: "returns",
          heading: "2. Returns and exchanges",
          blocks: [
            {
              type: "list",
              items: [
                "Request a return or size exchange within {{returnWindowDays}} days of delivery from your account.",
                "Items must be unused, unwashed, with original tags and packaging.",
                "Damaged, defective or wrong items: report within {{damageReportHours}} hours of delivery with photos, and we will replace or refund at no cost.",
                "Not returnable for hygiene reasons: innerwear, perfumes, sunglasses and some accessories — this is shown on the product page before you buy. Items marked \"final sale\" can be exchanged for size only.",
                "We arrange a reverse pickup where available. Any return fee is shown before you confirm the return; returns for damaged or wrong items are always free.",
              ],
            },
          ],
        },
        {
          id: "refunds",
          heading: "3. Refunds",
          blocks: [
            {
              type: "list",
              items: [
                "After the returned item passes a quality check, we start the refund within {{refundInitiateDays}} days.",
                "Prepaid orders are refunded to the original payment method. The time to reach your account depends on your bank or payment provider.",
                "Cash on Delivery orders are refunded to a UPI ID or bank account you give us, or as store credit if you choose it.",
                "You may choose store credit instead of a refund; it is never forced on you.",
              ],
            },
          ],
        },
        {
          id: "help",
          heading: "4. Need help?",
          blocks: [
            {
              type: "p",
              text: "Contact {{supportEmail}} · {{supportPhone}} ({{supportHours}}). Complaints: Grievance Officer {{grievanceName}}, {{grievanceEmail}} — acknowledged within {{ackHours}} hours, resolved within {{resolveDays}} days.",
            },
          ],
        },
      ],
    },
  },
};
