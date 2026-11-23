import { rateLimiter } from "@/lib/http/rate-limit";

/**
 * Gift card codes are bearer secrets with 80 bits of entropy, so guessing is infeasible — but failed attempts are
 * still capped per customer (10 / hour) and per IP (30 / hour) to stop scripted probing and keep logs clean.
 */
const HOUR = 3_600_000;

export async function giftCardTriesLeft(customerId: string, ip: string): Promise<boolean> {
  return await rateLimiter.peek(`giftcard-fail:c:${customerId}`, 10, HOUR) && await rateLimiter.peek(`giftcard-fail:ip:${ip}`, 30, HOUR);
}

export async function recordGiftCardFailure(customerId: string, ip: string) {
  await rateLimiter.hit(`giftcard-fail:c:${customerId}`, 10, HOUR);
  await rateLimiter.hit(`giftcard-fail:ip:${ip}`, 30, HOUR);
}
