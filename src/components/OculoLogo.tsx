/**
 * OculoLogo — refined animated brand mark for Oculo.
 *
 * A meticulously crafted SVG eye that breathes, thinks, and speaks. The mark
 * reacts to a global "agent state" via the `oculo:state` window event so it can
 * synchronize across the entire UI (sidebar, top bar, auth, intro) without
 * prop-drilling.
 *
 *   States:
 *   - "idle"     → slow breath, subtle iris drift (saccade), gentle catchlight twinkle
 *   - "thinking" → outer + inner rings counter-rotate, pupil pulses, orbiting spark
 *   - "speaking" → emit ripple waves, quick blink, soft glow halo
 *
 * Anyone can update state with:
 *   window.dispatchEvent(new CustomEvent("oculo:state", { detail: "thinking" }));
 *
 * Visual layers (back → front):
 *   1. Outer ripple wave (speaking only)
 *   2. Soft radial glow (intensifies in speaking/thinking)
 *   3. Eye almond lid — gradient stroke
 *   4. Outer iris ring — long dashes, slow rotation
 *   5. Inner iris ring — short dashes, counter-rotation
 *   6. Pupil — pulses
 *   7. Catchlight — fixed white highlight
 *   8. Orbiting spark — visible while thinking
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
  const ringOuterDur =
    active === "thinking" ? "3s" : active === "speaking" ? "8s" : "22s";
  const ringInnerDur =
    active === "thinking" ? "2s" : active === "speaking" ? "6s" : "18s";
  const pupilDur =
    active === "speaking" ? "0.5s" : active === "thinking" ? "1.1s" : "4s";
  const blinkDur = active === "speaking" ? "2s" : "11s";
  const driftDur = active === "idle" ? "7s" : "0s";

  const stroke = withGradient ? `url(#oculo-grad-${gradId})` : "currentColor";
  const fill = withGradient ? `url(#oculo-grad-${gradId})` : "currentColor";

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
          ["--oculo-ring-outer-dur" as any]: ringOuterDur,
          ["--oculo-ring-inner-dur" as any]: ringInnerDur,
          ["--oculo-pupil-dur" as any]: pupilDur,
          ["--oculo-blink-dur" as any]: blinkDur,
          ["--oculo-drift-dur" as any]: driftDur,
        } as React.CSSProperties
      }
    >
      <defs>
        {/* Primary brand gradient — terracotta → warm peach */}
        <linearGradient id={`oculo-grad-${gradId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="55%" stopColor="hsl(var(--primary-glow))" />
          <stop offset="100%" stopColor="hsl(var(--accent-foreground))" />
        </linearGradient>

        {/* Iris fill — slightly darker for depth */}
        <radialGradient id={`oculo-iris-${gradId}`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.12" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>

        {/* Soft outer glow */}
        <radialGradient id={`oculo-glow-${gradId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>

        {/* Mask: clip everything to the eye almond so iris/pupil never spill out */}
        <clipPath id={`oculo-clip-${gradId}`}>
          <path d="M6 32 Q 32 6 58 32 Q 32 58 6 32 Z" />
        </clipPath>
      </defs>

      {/* Layer 1 — Outer ripple wave (speaking only) */}
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.4"
        strokeWidth="1"
        className={cn("oculo-wave oculo-wave-1", active === "speaking" && "is-active")}
      />
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.3"
        strokeWidth="1"
        className={cn("oculo-wave oculo-wave-2", active === "speaking" && "is-active")}
      />

      {/* Layer 2 — Soft glow halo (intensifies on thinking/speaking) */}
      <circle
        cx="32"
        cy="32"
        r="22"
        fill={`url(#oculo-glow-${gradId})`}
        className={cn(
          "oculo-glow",
          active === "speaking" && "is-strong",
          active === "thinking" && "is-medium",
        )}
      />

      {/* Layer 3 — Eye almond lid */}
      <g className={cn("oculo-lid", active === "speaking" && "is-blinking")}>
        <path
          d="M6 32 Q 32 6 58 32 Q 32 58 6 32 Z"
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>

      {/* Iris contents — clipped to the almond so nothing spills */}
      <g clipPath={`url(#oculo-clip-${gradId})`}>
        {/* Iris fill — soft radial */}
        <circle cx="32" cy="32" r="14" fill={`url(#oculo-iris-${gradId})`} />

        {/* Drift wrapper — gentle saccade on idle */}
        <g className="oculo-drift">
          {/* Layer 4 — Outer iris ring (slow, long dashes) */}
          <g className="oculo-ring-outer" style={{ transformOrigin: "32px 32px" }}>
            <circle
              cx="32"
              cy="32"
              r="13"
              fill="none"
              stroke={stroke}
              strokeWidth="1.6"
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
          </g>

          {/* Layer 5 — Inner iris ring (counter-rotates, short dashes) */}
          <g className="oculo-ring-inner" style={{ transformOrigin: "32px 32px" }}>
            <circle
              cx="32"
              cy="32"
              r="9"
              fill="none"
              stroke={stroke}
              strokeOpacity="0.7"
              strokeWidth="1"
              strokeDasharray="2 2.5"
              strokeLinecap="round"
            />
          </g>

          {/* Layer 6 — Pupil */}
          <circle
            cx="32"
            cy="32"
            r="4.2"
            fill={fill}
            className="oculo-pupil"
          />

          {/* Layer 7 — Catchlight (gives life) */}
          <circle
            cx="34.5"
            cy="29.5"
            r="1.5"
            fill="hsl(var(--primary-foreground))"
            opacity="0.95"
            className="oculo-catch"
          />
          <circle
            cx="30"
            cy="33.5"
            r="0.7"
            fill="hsl(var(--primary-foreground))"
            opacity="0.6"
          />
        </g>

        {/* Layer 8 — Orbiting spark (visible while thinking) */}
        {active === "thinking" && (
          <g className="oculo-orbit" style={{ transformOrigin: "32px 32px" }}>
            <circle cx="32" cy="17" r="1.4" fill="hsl(var(--primary-glow))" />
          </g>
        )}
      </g>
    </svg>
  );
}
