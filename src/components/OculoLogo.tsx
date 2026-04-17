/**
 * OculoLogo — naturalistic animated eye for Oculo.
 *
 * Designed to read as a real human eye, not a geometric clockwork.
 *
 * Anatomy (back → front):
 *   1. Sclera (white of the eye) inside the almond
 *   2. Iris — solid coloured disc with radial fibre striations (not dashed rings)
 *   3. Pupil — solid black, dilates/contracts gently
 *   4. Specular highlights — primary catchlight + small secondary
 *   5. Eye outline — almond, slightly asymmetric (outer corner lower)
 *   6. Upper + lower eyelids — two paths that meet at the centre when blinking
 *      (animated via clip-path so the lid CLOSES naturally instead of squashing)
 *   7. Lash hint — short strokes above the upper lid
 *
 * States (broadcast via window event "oculo:state"):
 *   - idle     → slow breath, micro saccades, occasional natural blink
 *   - thinking → eyes look up-left/right (searching), pupil narrows slightly
 *   - speaking → faster blinks + faint glow halo
 */
import { useEffect, useState, useId } from "react";
import { cn } from "@/lib/utils";

export type OculoState = "idle" | "thinking" | "speaking";

interface Props {
  size?: number;
  state?: OculoState;
  className?: string;
  /** Use the brand gradient for the iris. Set false on coloured chips. */
  withGradient?: boolean;
}

export function setOculoState(s: OculoState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("oculo:state", { detail: s }));
}

export function OculoLogo({ size = 24, state, className, withGradient = true }: Props) {
  const [internal, setInternal] = useState<OculoState>("idle");
  const uid = useId().replace(/:/g, "");
  const active = state ?? internal;

  useEffect(() => {
    if (state) return;
    const onState = (e: Event) => {
      const next = (e as CustomEvent<OculoState>).detail;
      if (next === "idle" || next === "thinking" || next === "speaking") setInternal(next);
    };
    window.addEventListener("oculo:state", onState as EventListener);
    return () => window.removeEventListener("oculo:state", onState as EventListener);
  }, [state]);

  // Per-state timings
  const blinkDur = active === "speaking" ? "2.6s" : "6.5s";
  const pupilDur = active === "speaking" ? "1s" : active === "thinking" ? "1.6s" : "5s";
  const gazeDur = active === "thinking" ? "2.4s" : "9s";

  const irisFill = withGradient ? `url(#oculo-iris-${uid})` : "currentColor";
  const lidStroke = withGradient ? `url(#oculo-lid-${uid})` : "currentColor";

  // Almond eye shape — slightly asymmetric for naturalness.
  // Outer (right) corner sits 1px lower than inner (left) corner.
  const ALMOND = "M5 33 Q 18 11 32 11 Q 48 11 59 34 Q 47 53 32 53 Q 17 53 5 33 Z";

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
          ["--oculo-blink-dur" as any]: blinkDur,
          ["--oculo-pupil-dur" as any]: pupilDur,
          ["--oculo-gaze-dur" as any]: gazeDur,
        } as React.CSSProperties
      }
    >
      <defs>
        {/* Iris: warm radial — bright centre, deeper rim */}
        <radialGradient id={`oculo-iris-${uid}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="hsl(var(--primary-glow))" />
          <stop offset="55%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(15 55% 38%)" />
        </radialGradient>

        {/* Lid stroke gradient */}
        <linearGradient id={`oculo-lid-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary-glow))" />
        </linearGradient>

        {/* Sclera: warm off-white, very subtle gradient */}
        <radialGradient id={`oculo-sclera-${uid}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="hsl(36 40% 98%)" />
          <stop offset="100%" stopColor="hsl(30 18% 88%)" />
        </radialGradient>

        {/* Soft glow halo */}
        <radialGradient id={`oculo-glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>

        {/* Clip the eyeball contents to the almond */}
        <clipPath id={`oculo-eye-${uid}`}>
          <path d={ALMOND} />
        </clipPath>

        {/* BLINK MASK — two rectangles that close to the centre line.
            White = visible, black = hidden. On blink the upper rect slides
            down and lower rect slides up so they meet at y=32, naturally
            covering the eye instead of squashing it. */}
        <mask id={`oculo-blink-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="black" />
          <rect className="oculo-mask-top" x="0" y="0" width="64" height="32" fill="white" />
          <rect className="oculo-mask-bot" x="0" y="32" width="64" height="32" fill="white" />
        </mask>
      </defs>

      {/* Glow halo (intensifies on speaking/thinking) */}
      <circle
        cx="32"
        cy="32"
        r="24"
        fill={`url(#oculo-glow-${uid})`}
        className={cn(
          "oculo-glow",
          active === "speaking" && "is-strong",
          active === "thinking" && "is-medium",
        )}
      />

      {/* Brow hint — a subtle soft arc above the eye */}
      <path
        d="M10 18 Q 32 8 54 19"
        fill="none"
        stroke={lidStroke}
        strokeOpacity="0.25"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* === Eye group: everything inside is hidden by the blink mask === */}
      <g mask={`url(#oculo-blink-${uid})`}>
        {/* Sclera + iris (clipped to almond so nothing spills) */}
        <g clipPath={`url(#oculo-eye-${uid})`}>
          {/* Sclera */}
          <path d={ALMOND} fill={`url(#oculo-sclera-${uid})`} />

          {/* Gaze group — moves the iris a few px for saccades / look-around */}
          <g className="oculo-gaze">
            {/* Iris */}
            <circle cx="32" cy="32" r="11" fill={irisFill} />

            {/* Iris fibre striations — short radial strokes for realism */}
            <g
              stroke="hsl(15 60% 30%)"
              strokeOpacity="0.45"
              strokeWidth="0.6"
              strokeLinecap="round"
            >
              {Array.from({ length: 18 }).map((_, i) => {
                const a = (i / 18) * Math.PI * 2;
                const x1 = 32 + Math.cos(a) * 5.5;
                const y1 = 32 + Math.sin(a) * 5.5;
                const x2 = 32 + Math.cos(a) * 10.5;
                const y2 = 32 + Math.sin(a) * 10.5;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
            </g>

            {/* Iris rim — thin darker ring */}
            <circle
              cx="32"
              cy="32"
              r="11"
              fill="none"
              stroke="hsl(15 60% 25%)"
              strokeOpacity="0.55"
              strokeWidth="0.7"
            />

            {/* Pupil */}
            <circle cx="32" cy="32" r="4.2" fill="hsl(20 15% 8%)" className="oculo-pupil" />

            {/* Primary catchlight — upper-right, soft blob */}
            <ellipse
              cx="34.6"
              cy="29.4"
              rx="1.7"
              ry="1.3"
              fill="hsl(0 0% 100%)"
              opacity="0.95"
            />
            {/* Secondary tiny highlight */}
            <circle cx="30.4" cy="33.4" r="0.55" fill="hsl(0 0% 100%)" opacity="0.7" />
          </g>

          {/* Lower lid shadow inside the eye for depth */}
          <path
            d="M5 33 Q 32 48 59 34"
            fill="none"
            stroke="hsl(20 15% 20%)"
            strokeOpacity="0.18"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>

        {/* Eye outline (almond) — drawn on top of sclera/iris */}
        <path
          d={ALMOND}
          fill="none"
          stroke={lidStroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Inner-corner caruncle hint */}
        <circle cx="6.5" cy="33" r="1" fill="hsl(15 50% 70%)" opacity="0.55" />
      </g>

      {/* Upper lash hint — a few short strokes above the upper lid.
          These don't blink (they're outside the mask) but they help sell
          the "real eye" silhouette. */}
      <g
        stroke={lidStroke}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
        className="oculo-lashes"
      >
        <line x1="18" y1="14" x2="17" y2="10" />
        <line x1="25" y1="11.5" x2="24.5" y2="7" />
        <line x1="32" y1="11" x2="32" y2="6.5" />
        <line x1="39" y1="11.5" x2="39.8" y2="7" />
        <line x1="46" y1="14" x2="47.2" y2="10" />
      </g>
    </svg>
  );
}
