import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * Gift card codes are bearer secrets with 80 bits of entropy, so guessing is infeasible — but failed attempts are
 * still capped per customer (10 / hour) and per IP (30 / hour) to stop scripted probing and keep logs clean.
 */
const HOUR = 3_600_000;

export function giftCardTriesLeft(customerId: string, ip: string): boolean {
  return rateLimiter.peek(`giftcard-fail:c:${customerId}`, 10, HOUR) && rateLimiter.peek(`giftcard-fail:ip:${ip}`, 30, HOUR);
}

export function recordGiftCardFailure(customerId: string, ip: string) {
  rateLimiter.hit(`giftcard-fail:c:${customerId}`, 10, HOUR);
  rateLimiter.hit(`giftcard-fail:ip:${ip}`, 30, HOUR);
}
