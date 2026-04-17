/**
 * OculoLogo — animated brand mark for Oculo.
 *
 * A minimalist eye drawn entirely in SVG. The logo reacts to a global
 * "agent state" broadcast via the `oculo:state` window event so it can pulse,
 * spin, or blink without prop-drilling from the chat view down to every
 * sidebar / auth screen.
 *
 *   States:
 *   - "idle"     → slow breath + gentle iris drift (default)
 *   - "thinking" → iris ring rotates, pupil pulses faster
 *   - "speaking" → quick blink + emit waves
 *
 * Anyone can update the state with:
 *   window.dispatchEvent(new CustomEvent("oculo:state", { detail: "thinking" }));
 *
 * The mark uses `currentColor` for the iris stroke and the conversation's
 * primary gradient (--gradient-primary) for the iris fill, so it reads cleanly
 * in both light and dark mode and stays consistent with the rest of the UI.
 */
import { useEffect, useState, useId } from "react";
import { cn } from "@/lib/utils";

export type OculoState = "idle" | "thinking" | "speaking";

interface Props {
  size?: number;
  /** Override the global state (e.g. on the auth/onboarding screen). */
  state?: OculoState;
  className?: string;
  /** Force the gradient look even when used over a colored chip. */
  withGradient?: boolean;
}

/** Broadcast a new state to every mounted Oculo logo. */
export function setOculoState(s: OculoState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("oculo:state", { detail: s }));
}

export function OculoLogo({ size = 24, state, className, withGradient = true }: Props) {
  const [internal, setInternal] = useState<OculoState>("idle");
  const gradId = useId().replace(/:/g, "");
  const active = state ?? internal;

  useEffect(() => {
    if (state) return; // controlled mode — ignore global events
    const onState = (e: Event) => {
      const next = (e as CustomEvent<OculoState>).detail;
      if (next === "idle" || next === "thinking" || next === "speaking") {
        setInternal(next);
      }
    };
    window.addEventListener("oculo:state", onState as EventListener);
    return () => window.removeEventListener("oculo:state", onState as EventListener);
  }, [state]);

  // Per-state animation timing (CSS variables consumed below)
  const ringDuration =
    active === "thinking" ? "2.5s" : active === "speaking" ? "6s" : "16s";
  const pupilDuration =
    active === "speaking" ? "0.45s" : active === "thinking" ? "0.9s" : "3.2s";
  const blinkDuration = active === "speaking" ? "1.6s" : "9s";

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Oculo"
      className={cn("oculo-logo select-none", className)}
      style={
        {
          // expose timings to the CSS keyframes below
          ["--oculo-ring-dur" as any]: ringDuration,
          ["--oculo-pupil-dur" as any]: pupilDuration,
          ["--oculo-blink-dur" as any]: blinkDuration,
        } as React.CSSProperties
      }
    >
      <defs>
        <linearGradient id={`oculo-grad-${gradId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--accent))" />
        </linearGradient>
        {/* Soft glow under the iris during speaking state */}
        <radialGradient id={`oculo-glow-${gradId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer "speaking" wave — only animates in speaking state */}
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.35"
        strokeWidth="1"
        className={cn("oculo-wave", active === "speaking" && "is-active")}
      />

      {/* Eye almond shape — top + bottom curves form the lid */}
      <g className={cn("oculo-lid", active === "speaking" && "is-blinking")}>
        <path
          d="M6 32 Q 32 6 58 32 Q 32 58 6 32 Z"
          fill="none"
          stroke={withGradient ? `url(#oculo-grad-${gradId})` : "currentColor"}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>

      {/* Iris ring — rotates depending on state */}
      <g className="oculo-ring" style={{ transformOrigin: "32px 32px" }}>
        <circle
          cx="32"
          cy="32"
          r="13"
          fill={withGradient ? `url(#oculo-grad-${gradId})` : "currentColor"}
          fillOpacity="0.18"
          stroke={withGradient ? `url(#oculo-grad-${gradId})` : "currentColor"}
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      </g>

      {/* Soft glow during speaking */}
      {active === "speaking" && (
        <circle cx="32" cy="32" r="14" fill={`url(#oculo-glow-${gradId})`} />
      )}

      {/* Pupil — breathes/pulses */}
      <circle
        cx="32"
        cy="32"
        r="4.5"
        fill={withGradient ? `url(#oculo-grad-${gradId})` : "currentColor"}
        className="oculo-pupil"
      />

      {/* Catchlight — fixed white highlight, gives life to the eye */}
      <circle cx="35" cy="29" r="1.4" fill="hsl(var(--primary-foreground))" opacity="0.9" />
    </svg>
  );
}
