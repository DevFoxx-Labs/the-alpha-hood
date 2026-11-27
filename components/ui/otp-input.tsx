"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * One-time code entry: a separate box per digit (4 or 6 — `length`), square corners (DESIGN.md).
 *
 * Built on ONE real <input> laid over the boxes, so everything the platform does with codes keeps working:
 * SMS / email autofill (`autocomplete="one-time-code"`, iOS + Android keyboards), paste of the whole code (spaces and
 * dashes are dropped), backspace, select-all, screen readers (they read one field, not six). The boxes are only a
 * picture of that input (`aria-hidden`).
 *
 * Visual actions: the next box is active (black border + blinking caret); each digit pops in; `status="error"`
 * shakes the row and turns it red (typing again starts a fresh code); `status="success"` turns it green with a small bounce; `onComplete` fires once
 * when the last digit is entered (auto-verify). Animations are transform / opacity only and switch off under
 * prefers-reduced-motion (globals.css).
 */
export interface OtpInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Number of digits (4 or 6). */
  length?: 4 | 6;
  /** Called with the full code when the last digit is typed / pasted. */
  onComplete?: (code: string) => void;
  status?: "idle" | "error" | "success";
  disabled?: boolean;
  autoFocus?: boolean;
  /** Accessible name when there is no visible <label htmlFor={id}>. */
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

/**
 * What the code becomes after an edit (typing, paste, autofill, delete). Digits only, at most `length`.
 * After a wrong code, one more digit starts a fresh code. `complete` is true only when the last digit was just
 * added (not when deleting from a full code), so auto-verify fires once. null = nothing changed.
 */
export function nextOtpValue(raw: string, current: string, length: number, status: OtpInputProps["status"] = "idle"): { value: string; complete: boolean } | null {
  const all = raw.replace(/\D/g, "");
  const value = status === "error" && current.length === length && all.length === length + 1 ? all.slice(-1) : all.slice(0, length);
  if (value === current) return null;
  return { value, complete: value.length === length && current.length < length };
}

export function OtpInput({ id, value, onChange, length = 6, onComplete, status = "idle", disabled, autoFocus, className, ...aria }: OtpInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, length);
  const active = Math.min(digits.length, length - 1);

  const set = (raw: string) => {
    const r = nextOtpValue(raw, digits, length, status);
    if (!r) return;
    onChange(r.value);
    if (r.complete) onComplete?.(r.value);
  };

  return (
    <div className={cn("relative w-full max-w-[360px]", className)} onClick={() => ref.current?.focus()}>
      {/* Only the picture re-mounts on a new error (to replay the shake); the real input keeps its focus. */}
      <div
        key={status === "error" ? `e${digits}` : "row"}
        aria-hidden="true"
        className={cn("grid gap-2", status === "error" && "otp-shake")}
        style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
      >
        {Array.from({ length }, (_, i) => {
          const char = digits[i];
          const isActive = focused && !disabled && i === active && status !== "success";
          return (
            <div
              key={i}
              className={cn(
                "relative grid aspect-[5/6] max-h-[60px] place-items-center border bg-white text-[22px] font-bold tabular-nums transition-colors duration-150",
                status === "error"
                  ? "border-accent bg-accent-tint text-accent"
                  : status === "success"
                    ? "otp-done border-green bg-green-tint text-green"
                    : isActive
                      ? "border-2 border-ink"
                      : char
                        ? "border-ink"
                        : "border-[#bdbdbd]",
                disabled && status === "idle" && "bg-soft text-ink-2",
              )}
              style={status === "success" ? { animationDelay: `${i * 40}ms` } : undefined}
            >
              {char ? (
                <span key={char + i} className="otp-pop">
                  {char}
                </span>
              ) : isActive ? (
                <span className="otp-caret block h-6 w-[2px] bg-ink" />
              ) : null}
            </div>
          );
        })}
      </div>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length + 4}
        value={digits}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={status === "error" || undefined}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        onChange={(e) => set(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          set(e.clipboardData.getData("text"));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Always type at the end: arrow keys / clicks don't move the caret into the middle of the code.
        onSelect={(e) => {
          const el = e.currentTarget;
          if (el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length) el.setSelectionRange(el.value.length, el.value.length);
        }}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
        style={{ fontSize: 16 /* no iOS zoom */ }}
      />
    </div>
  );
}
