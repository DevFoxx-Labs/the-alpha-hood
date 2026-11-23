import type { Notice } from "../types";

/**
 * Terms of Service — includes the seller disclosures required by the Consumer Protection (E-Commerce)
 * Rules, 2020 (legal name, address, contact, grievance officer). DRAFT: lawyer review before launch.
 */
export const TERMS_NOTICE: Notice = {
  slug: "terms",
  version: "2026-11-25",
  lastUpdated: "2026-11-25",
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
          id: "alpha-club",
          heading: "Alpha Club and Hood Coins",
          blocks: [
            {
              type: "list",
              items: [
                "The Alpha Club is free and optional. You join by ticking the box in your account; you can leave at any time.",
                "Members earn Hood Coins on the amount paid for products (not shipping or fees): 5 per ₹100 for Member, 7 for Elite and 10 for Legend. 1 Hood Coin is worth ₹1.",
                "Coins are added when an order is delivered and become usable after its return window ends. Coins on items you return are taken back.",
                "Coins expire 365 days after they become usable. They have no cash value and can't be transferred or sold.",
                "Tiers are based on what you spent in the last 12 months (after refunds): Elite from ₹15,000, Legend from ₹40,000.",
                "Members get a 30-day return window on orders placed while they are members.",
                "Invite a friend with your code: they get ₹200 off a first order of ₹999 or more, and you get 200 coins once their order is delivered and kept. Codes can't be used on your own account, address or device.",
                "You can pay with Hood Coins at checkout: up to 20% of the products' value per order. If you return items, the coins used on them come back to you; coins paid back this way are valid for 365 days.",
                "If you leave the Alpha Club or delete your account, unused coins (including pending ones) are forfeited.",
                "We may change these rules with 30 days' notice on this page; coins you already have keep their expiry date. Abuse (fake accounts, self-referral) cancels coins.",
              ],
            },
          ],
        },
        {
          id: "gift-cards",
          heading: "Gift cards and store credit",
          blocks: [
            {
              type: "list",
              items: [
                "Gift cards are digital, from ₹500 to ₹10,000, and valid for 1 year from issue. Use them at checkout, fully or in parts; they can't be exchanged for cash.",
                "Anyone with the code can use a gift card — keep it private. If you think it was misused, contact us and we can block it.",
                "Store credit can be used at checkout and stays while your account is active.",
                "Gift cards, store credit and Hood Coins are ways to pay: your invoice shows the full price and GST, and how it was paid.",
                "If an order paid this way is cancelled, everything goes back where it came from. Refunds for returns are split in the same proportion as you paid; a gift card that has expired or been blocked is refunded as store credit.",
              ],
            },
          ],
        },
        {
          id: "ugc",
          heading: "#WearTheHood photos",
          blocks: [
            {
              type: "list",
              items: [
                "You can share a photo of products you bought. It appears on our website only after we review it, with your first name.",
                "Only share photos you took. Anyone else in the photo must have agreed, and no children may appear in it.",
                "You let us show the photo on our website while it is published. We don't use it in ads without asking you separately.",
                "You can remove your photo any time from your account; it stops showing at once.",
                "We may refuse or remove photos that break these rules.",
              ],
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
