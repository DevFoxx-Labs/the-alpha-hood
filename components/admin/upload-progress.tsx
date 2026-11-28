import { cn } from "@/lib/utils";

/** Upload progress: preparing (auto-fit) → sending with % → the server checks and stores it. */
export type UploadPhase = { step: "idle" } | { step: "preparing" } | { step: "sending"; pct: number; label?: string } | { step: "processing"; label?: string };

/** The % bar under an upload button (uploadMedia → onProgress). Announced politely to screen readers. */
export function UploadProgress({ phase }: { phase: UploadPhase }) {
  if (phase.step === "idle") return null;
  const prefix = "label" in phase && phase.label ? `${phase.label}: ` : "";
  const text = phase.step === "preparing" ? "Preparing the image…" : phase.step === "sending" ? `${prefix}Uploading… ${phase.pct}%` : `${prefix}Processing on the server…`;
  return (
    <div className="space-y-1" role="status" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full bg-primary transition-[width] duration-200", phase.step !== "sending" && "animate-pulse")}
          style={{ width: phase.step === "sending" ? `${phase.pct}%` : phase.step === "processing" ? "100%" : "15%" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

/** onProgress → phase: 0–99 % sending, 100 % = the bytes are up and the server is working. */
export const progressPhase = (pct: number, label?: string): UploadPhase => (pct >= 100 ? { step: "processing", label } : { step: "sending", pct, label });
