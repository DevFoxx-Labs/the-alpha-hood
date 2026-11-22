import type { Notice } from "../types";

/**
 * Terms of Service — includes the seller disclosures required by the Consumer Protection (E-Commerce)
 * Rules, 2020 (legal name, address, contact, grievance officer). DRAFT: lawyer review before launch.
 */
export const TERMS_NOTICE: Notice = {
  slug: "terms",
  version: "2026-11-22",
  lastUpdated: "2026-11-22",
  text: {
    en: {
      title: "Terms of Service",
      summary: "The rules for using {{storeName}} and buying from us.",
      sections: [
        {
          id: "seller",
          heading: "1. Who you are buying from",
          blocks: [
            {
              type: "p",
              text: "{{storeName}} is owned and operated by {{entityName}}, {{registeredAddress}}, GSTIN {{gstin}}. Customer care: {{supportEmail}} · {{supportPhone}} ({{supportHours}}). We sell our own products; we are not a marketplace.",
            },
          ],
        },
        {
          id: "eligibility",
          heading: "2. Using the store",
          blocks: [
            {
              type: "list",
              items: [
                "You must be {{minimumAge}} or older to create an account or place an order.",
                "Keep your account secure. Sign-in is by a one-time code sent to your verified mobile number or email; never share it.",
                "Do not misuse the store: no automated scraping, fraud, coupon abuse, fake orders or attempts to break our security.",
                "We may suspend accounts that break these terms, after telling you why where the law allows.",
              ],
            },
          ],
        },
        {
          id: "products-prices",
          heading: "3. Products and prices",
          blocks: [
            {
              type: "list",
              items: [
                "Prices are in Indian Rupees and inclusive of all taxes. The MRP and any discount are shown on each product.",
                "Product pages show the details required by the Legal Metrology rules: MRP, manufacturer/packer/importer, country of origin, net quantity and customer care contact.",
                "Colours on screen can differ slightly from the actual product. Size guides are a guide; check the measurements before you order.",
                "The total you pay — including shipping, Cash on Delivery fees and any other charges — is shown before you confirm the order.",
                "If we show a wrong price because of an obvious error, we will tell you and you can confirm at the correct price or cancel for a full refund.",
              ],
            },
          ],
        },
        {
          id: "orders",
          heading: "4. Orders and payment",
          blocks: [
            {
              type: "list",
              items: [
                "Your order is a request to buy. A contract is formed when we confirm it by email/SMS.",
                "We may cancel an order if the item is out of stock, the address is not serviceable, or we see signs of fraud; any amount paid is refunded in full.",
                "Online payments are processed by our payment gateway. We never see your full card number, CVV or UPI PIN.",
                "Cash on Delivery needs an OTP-verified mobile number and may have a fee, a maximum order value and eligibility rules shown at checkout.",
              ],
            },
          ],
        },
        {
          id: "offers",
          heading: "5. Coupons and offers",
          blocks: [
            {
              type: "p",
              text: "Each coupon or combo has its own conditions (minimum value, dates, eligible products, limits per customer) shown with the offer. Offers cannot be exchanged for cash. We only show real sale end times and real stock counts.",
            },
          ],
        },
        {
          id: "delivery-returns",
          heading: "6. Delivery, cancellations and returns",
          blocks: [
            {
              type: "p",
              text: "Estimated delivery dates are shown before you pay. Cancellations, returns, exchanges and refunds are covered by our Refund & Cancellation Policy (/legal/refund-cancellation).",
            },
          ],
        },
        {
          id: "content",
          heading: "7. Reviews and content you post",
          blocks: [
            {
              type: "p",
              text: "Reviews must be honest and about your own experience. We publish all genuine reviews, positive or negative, and remove only those that are unlawful, abusive, spam or unrelated. You let us display your review and photos on our store and channels; you can ask us to remove them.",
            },
          ],
        },
        {
          id: "ip",
          heading: "8. Our content",
          blocks: [
            {
              type: "p",
              text: "The brand, logo, designs, photos and text on the store belong to us or our licensors. Do not copy them for commercial use without permission.",
            },
          ],
        },
        {
          id: "liability",
          heading: "9. Liability",
          blocks: [
            {
              type: "p",
              text: "Nothing in these terms limits your rights under the Consumer Protection Act, 2019 or any other law that cannot be excluded. Otherwise, our liability for an order is limited to the amount you paid for it.",
            },
          ],
        },
        {
          id: "privacy",
          heading: "10. Privacy",
          blocks: [
            {
              type: "p",
              text: "How we use personal data is explained in our Privacy Notice (/legal/privacy).",
            },
          ],
        },
        {
          id: "grievance",
          heading: "11. Grievances",
          blocks: [
            {
              type: "p",
              text: "Grievance Officer: {{grievanceName}}, {{grievanceDesignation}} — {{grievanceEmail}}, {{grievancePhone}}, {{registeredAddress}}. We acknowledge complaints within {{ackHours}} hours and resolve them within {{resolveDays}} days. You may also approach the National Consumer Helpline or the consumer commission.",
            },
          ],
        },
        {
          id: "law",
          heading: "12. Governing law and changes",
          blocks: [
            {
              type: "p",
              text: "These terms are governed by the laws of India; subject to your rights as a consumer, the courts at {{jurisdictionCity}} have jurisdiction. We will post changes here with a new date; orders already placed follow the terms in force when you placed them.",
            },
          ],
        },
      ],
    },
  },
};
