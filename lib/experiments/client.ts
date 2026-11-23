"use client";

import { useEffect, useState } from "react";
import { consentFor, track } from "@/lib/analytics/client";
import { EXPERIMENTS, type ExperimentId, variantFor } from "./config";

const KEY = "ah_ab_id";
const seen = new Set<string>();

function bucketId(): string | null {
  if (!consentFor("analytics")) return null;
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Variant for this visitor; "control" on the server, before hydration, and without analytics consent. */
export function useExperiment(id: ExperimentId): string {
  const exp = EXPERIMENTS[id];
  const [variant, setVariant] = useState<string>(exp.variants[0]);
  useEffect(() => {
    if (!exp.enabled) return;
    const b = bucketId();
    if (!b) return;
    const v = variantFor(exp, b);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- assignment must wait for the browser (consent + storage)
    setVariant(v);
    if (!seen.has(id)) {
      seen.add(id);
      track("experiment_view", { experiment: id, variant: v });
    }
  }, [exp, id]);
  return variant;
}
