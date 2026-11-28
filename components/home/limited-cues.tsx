"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Impact cues for the limited-edition finale. The entrances are scrubbed by the scroll timeline, but a landing or a
 * stamp has to hit at its own speed, so it can't be scrubbed. Invisible 1 px markers sit at fixed depths in the
 * 260vh section. When one goes past the top of the screen, the section gets `data-<cue>`, and the CSS in
 * app/globals.css plays a short time-based animation. Scrolling back up removes the cue, so the animation plays
 * again next time.
 *
 * Depths are in vh from the section top. The pinned range ("contain") is 160vh long, so contain p% ≈ 1.6·p vh:
 * - land 64vh (contain 40%): ALPHA touches down, the claws slash, the stamp hits, the shadow squashes.
 * - slam 80vh (contain 50%): line 2 is in, the stage shakes once, the signature writes itself on.
 * - tally 86vh (contain ~54%): the pieces-left count runs down from the edition size to the real stock.
 *
 * Only with scroll timelines and without reduced motion (the same test as the CSS). Otherwise nothing runs and
 * every piece stays in its final, static place. `data-cues` on the section turns on the "waiting" states, so
 * without JavaScript nothing is hidden.
 */
export const LTD_CUES = { land: 64, slam: 80, tally: 86 } as const;
export type LtdCue = keyof typeof LTD_CUES;

const motionOk = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: no-preference)").matches && typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()");

/** A cue is on once its marker is above the top edge of the screen. */
export const cueOn = (isIntersecting: boolean, top: number) => !isIntersecting && top < 0;

export function LimitedCues() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current;
    const section = host?.closest<HTMLElement>(".ltd");
    if (!host || !section || !motionOk()) return;
    section.dataset.cues = "";
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const name = (e.target as HTMLElement).dataset.cue as LtdCue;
        const on = cueOn(e.isIntersecting, e.boundingClientRect.top);
        if (on === name in section.dataset) continue;
        if (on) section.dataset[name] = "";
        else delete section.dataset[name];
        section.dispatchEvent(new CustomEvent("ltd:cue", { detail: { name, on } }));
      }
    });
    host.querySelectorAll<HTMLElement>("[data-cue]").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      delete section.dataset.cues;
      for (const name of Object.keys(LTD_CUES)) delete section.dataset[name];
    };
  }, []);
  return (
    <span ref={ref} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-0 w-0">
      {Object.entries(LTD_CUES).map(([name, vh]) => (
        <span key={name} data-cue={name} className="absolute left-0 h-px w-px" style={{ top: `${vh}vh` }} />
      ))}
    </span>
  );
}

/** Ease-out step of the tally: `from` at t = 0, `to` at t = 1, whole pieces only. */
export function tallyAt(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return Math.round(from - (from - to) * (1 - (1 - k) ** 3));
}

const TALLY_MS = 1100;

/**
 * "37 left", counted down from the edition size when the call to action is in (cue `tally`). It always lands on the
 * real stock (`to`, from editionLeft), and that is also what the server renders and screen readers get. The count
 * itself is decorative.
 */
export function EditionTally({ from, to }: { from: number; to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to);
  useEffect(() => {
    const section = ref.current?.closest<HTMLElement>(".ltd");
    if (!section || from <= to || !motionOk()) return;
    let raf = 0;
    const run = (on: boolean) => {
      cancelAnimationFrame(raf);
      if (!on) {
        raf = requestAnimationFrame(() => setN(from));
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = (now - start) / TALLY_MS;
        setN(tallyAt(from, to, t));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    run("tally" in section.dataset);
    const onCue = (e: Event) => {
      const { name, on } = (e as CustomEvent<{ name: LtdCue; on: boolean }>).detail;
      if (name === "tally") run(on);
    };
    section.addEventListener("ltd:cue", onCue);
    return () => {
      cancelAnimationFrame(raf);
      section.removeEventListener("ltd:cue", onCue);
    };
  }, [from, to]);
  return (
    <span ref={ref}>
      <span aria-hidden="true" className="tabular-nums">
        {n.toLocaleString("en-IN")} left
      </span>
      <span className="sr-only">{to.toLocaleString("en-IN")} left</span>
    </span>
  );
}
