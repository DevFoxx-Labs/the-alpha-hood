import { rupees } from "@/lib/format";

/**
 * Store-wide commercial settings. Demo values — confirm with the owner before launch
 * (PRD §15 open questions: shipping threshold, COD limits, return window).
 */
export const STORE_CONFIG = {
  name: "The Alpha Hood",
  tagline: "Built for the ones who lead.",
  freeShippingThreshold: rupees(999),
  /** Standard shipping below the free-shipping threshold. */
  shippingFee: rupees(79),
  /** Cash-on-delivery handling fee and the largest order COD is offered for. */
  codFee: rupees(49),
  codMaxOrderValue: rupees(5000),
  /** CART-01: max quantity per SKU. */
  maxQtyPerSku: 5,
  returnWindowDays: 7,
  /** RET-01: damaged / wrong items must be reported within this many hours of delivery. */
  damageReportHours: 24,
  /** ORD-04 / RET-04: we start a refund within this many days of cancellation or a passed quality check. */
  refundInitiateDays: 2,
  /** Minimum age to use the store (DPDP: no children's data without verifiable parental consent). */
  minimumAge: 18,
} as const;
