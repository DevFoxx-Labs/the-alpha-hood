/**
 * ANL-04 A/B tests (feature flags with variants). Static config — the owner edits it; a test runs only when
 * `enabled` is true. Assignment happens in the browser, after hydration, and only for visitors who accepted
 * analytics cookies (the bucket id is analytics storage). Everyone else — and the server render — sees
 * `control`, so a test never shifts layout before paint (CLS) or changes what search engines see.
 * Never test prices or fake urgency (Consumer Protection E-Commerce Rules / dark patterns).
 */
export interface Experiment {
  id: string;
  description: string;
  variants: readonly string[];
  /** Same length as variants; whole numbers summing to 100. */
  weights: readonly number[];
  enabled: boolean;
}

export const EXPERIMENTS = {
  pdp_exchange_note: {
    id: "pdp_exchange_note",
    description: "PDP: show the free size-exchange promise under Add to bag",
    variants: ["control", "exchange_note"],
    weights: [50, 50],
    enabled: false,
  },
} as const satisfies Record<string, Experiment>;

export type ExperimentId = keyof typeof EXPERIMENTS;

/** FNV-1a hash → 0..99, stable for (bucket id, experiment). */
export function bucket(id: string, experiment: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${experiment}:${id}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

export function variantFor(exp: Experiment, id: string): string {
  if (!exp.enabled) return exp.variants[0];
  const b = bucket(id, exp.id);
  let acc = 0;
  for (let i = 0; i < exp.variants.length; i++) {
    acc += exp.weights[i];
    if (b < acc) return exp.variants[i];
  }
  return exp.variants[0];
}
