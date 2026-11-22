/** Customer-facing labels for order / return states. */
export const FULFILMENT_LABEL: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rto: "Returned to us",
  returned: "Returned",
  payment_failed: "Payment failed",
  refund: "Refund",
  return_requested: "Return requested",
  return_completed: "Return completed",
};

export const RETURN_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  qc_failed: "Didn't pass quality check",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function orderBadge(o: { status: string; fulfilment: string }): string {
  if (o.status === "pending_payment") return "Awaiting payment";
  if (o.status === "payment_failed") return "Payment failed";
  if (o.status === "expired") return "Payment not completed";
  if (o.status === "needs_review") return "Under review";
  return FULFILMENT_LABEL[o.fulfilment] ?? o.fulfilment;
}

export function dateLabel(iso: string, withTime = false): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}
