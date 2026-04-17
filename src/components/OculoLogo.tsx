/**
 * OculoLogo — photorealistic animated eye for Oculo.
 *
 * A meticulously layered SVG eye built from real ocular anatomy:
 *
 *   1.  Halo glow                     — ambient light around the eye
 *   2.  Brow shadow                   — soft arc above
 *   3.  Upper lid shadow on sclera    — under-lid darkening for depth
 *   4.  Sclera                        — warm off-white with subtle gradient
 *   5.  Vein hint                     — 1-2 micro vessels for realism
 *   6.  Limbal ring (outer)           — dark ring at iris edge
 *   7.  Iris base                     — radial gradient (light → deep)
 *   8.  Stroma fibres                 — 28 thin radial striations
 *   9.  Crypts / furrows              — 6 elongated darker patches
 *   10. Iris collarette               — wavy ring 1/3 from pupil
 *   11. Limbal ring (inner)           — thin dark ring at pupil edge
 *   12. Pupil                         — pure black, dilates naturally
 *   13. Catchlights                   — primary blob + small + tiny rim
 *   14. Lower lid shadow              — subtle line for tear pool
 *   15. Caruncle                      — pink tear duct at inner corner
 *   16. Eye outline (almond)          — gradient stroke
 *   17. Upper lash row                — curved strokes along lid
 *   18. Lower lash row                — shorter strokes below
 *
 * Animations (synced via window event "oculo:state"):
 *   - idle      : slow pupil dilation, micro saccades, occasional blink (~7s)
 *   - thinking  : faster gaze drift (looking around), pupil narrows
 *   - speaking  : faster blinks + glow halo intensifies
 *
 * Blink uses a two-half SVG mask that closes to the centreline — the
 * eye actually CLOSES instead of being squashed.
 */
import { useEffect, useState, useId } from "react";
import { cn } from "@/lib/utils";

export type OculoState = "idle" | "thinking" | "speaking";

interface Props {
  size?: number;
  state?: OculoState;
  className?: string;
  /** Use the brand iris gradient. Set false on coloured chips to inherit colour. */
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

  const blinkDur = active === "speaking" ? "3s" : "7s";
  const pupilDur = active === "speaking" ? "1.2s" : active === "thinking" ? "1.8s" : "5.5s";
  const gazeDur = active === "thinking" ? "2.6s" : "11s";

  // Almond eye — outer corner slightly lower than inner for natural asymmetry.
  // Designed at 64×64 viewBox; centre y=32, eye spans y≈14..50, x≈4..60.
  const ALMOND = "M4 33 Q 16 14 32 13 Q 49 13 60 33 Q 49 51 32 51 Q 17 51 4 33 Z";
  // Upper lid arc (used for lashes & shadow)
  const UPPER_LID = "M4 33 Q 16 14 32 13 Q 49 13 60 33";

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
        {/* Iris radial gradient: bright centre → deep rim */}
        {withGradient ? (
          <radialGradient id={`iris-${uid}`} cx="50%" cy="42%" r="58%">
            <stop offset="0%" stopColor="hsl(28 85% 72%)" />
            <stop offset="35%" stopColor="hsl(15 70% 58%)" />
            <stop offset="75%" stopColor="hsl(15 60% 40%)" />
            <stop offset="100%" stopColor="hsl(15 55% 26%)" />
          </radialGradient>
        ) : (
          <radialGradient id={`iris-${uid}`} cx="50%" cy="42%" r="58%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
            <stop offset="100%" stopColor="currentColor" />
          </radialGradient>
        )}

        {/* Sclera gradient — warm off-white, slightly shaded under upper lid */}
        <radialGradient id={`sclera-${uid}`} cx="50%" cy="65%" r="65%">
          <stop offset="0%" stopColor="hsl(36 50% 99%)" />
          <stop offset="80%" stopColor="hsl(30 25% 92%)" />
          <stop offset="100%" stopColor="hsl(28 18% 84%)" />
        </radialGradient>

        {/* Lid stroke gradient (matches brand) */}
        <linearGradient id={`lid-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary-glow))" />
        </linearGradient>

        {/* Halo glow */}
        <radialGradient id={`halo-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>

        {/* Upper-lid soft shadow on the sclera */}
        <linearGradient id={`lidshadow-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(20 25% 15%)" stopOpacity="0.35" />
          <stop offset="60%" stopColor="hsl(20 25% 15%)" stopOpacity="0" />
        </linearGradient>

        {/* Clip everything to the almond */}
        <clipPath id={`eye-${uid}`}>
          <path d={ALMOND} />
        </clipPath>

        {/* Blink mask — two halves close to the centre line */}
        <mask id={`blink-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="black" />
          <rect className="oculo-mask-top" x="0" y="0" width="64" height="32" fill="white" />
          <rect className="oculo-mask-bot" x="0" y="32" width="64" height="32" fill="white" />
        </mask>
      </defs>

      {/* 1 — Halo */}
      <circle
        cx="32" cy="32" r="26"
        fill={`url(#halo-${uid})`}
        className={cn(
          "oculo-glow",
          active === "speaking" && "is-strong",
          active === "thinking" && "is-medium",
        )}
      />

      {/* 2 — Brow */}
      <path
        d="M8 16 Q 32 6 56 17"
        fill="none"
        stroke={`url(#lid-${uid})`}
        strokeOpacity="0.22"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* === Eye contents — hidden by blink mask === */}
      <g mask={`url(#blink-${uid})`}>
        <g clipPath={`url(#eye-${uid})`}>
          {/* 4 — Sclera */}
          <path d={ALMOND} fill={`url(#sclera-${uid})`} />

          {/* 3 — Upper-lid shadow */}
          <rect x="2" y="13" width="60" height="14" fill={`url(#lidshadow-${uid})`} />

          {/* 5 — Vein hints */}
          <path
            d="M9 36 Q 14 38 18 35"
            fill="none"
            stroke="hsl(0 50% 55%)"
            strokeOpacity="0.18"
            strokeWidth="0.5"
            strokeLinecap="round"
          />
          <path
            d="M52 38 Q 56 36 58 38"
            fill="none"
            stroke="hsl(0 50% 55%)"
            strokeOpacity="0.16"
            strokeWidth="0.4"
            strokeLinecap="round"
          />

          {/* === Iris group — drifts together with pupil/highlights === */}
          <g className="oculo-gaze">
            {/* 6 — Outer limbal ring (dark) */}
            <circle cx="32" cy="32" r="11.4" fill="hsl(15 50% 18%)" opacity="0.85" />

            {/* 7 — Iris base */}
            <circle cx="32" cy="32" r="11" fill={`url(#iris-${uid})`} />

            {/* 8 — Stroma fibres (28 short radial strokes, varying length & opacity) */}
            <g stroke="hsl(15 55% 22%)" strokeLinecap="round">
              {Array.from({ length: 28 }).map((_, i) => {
                const a = (i / 28) * Math.PI * 2;
                // pseudo-random length & opacity per strand
                const seed = (i * 9301 + 49297) % 233280;
                const r = 0.55 + (seed / 233280) * 0.4;
                const opacity = 0.25 + (((seed >> 3) % 100) / 100) * 0.45;
                const inner = 4.6;
                const outer = 4.6 + r * 6;
                const x1 = 32 + Math.cos(a) * inner;
                const y1 = 32 + Math.sin(a) * inner;
                const x2 = 32 + Math.cos(a) * outer;
                const y2 = 32 + Math.sin(a) * outer;
                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    strokeWidth={0.45}
                    opacity={opacity}
                  />
                );
              })}
            </g>

            {/* Lighter cross-fibres for depth */}
            <g stroke="hsl(28 80% 80%)" strokeLinecap="round" strokeWidth="0.35">
              {Array.from({ length: 14 }).map((_, i) => {
                const a = ((i + 0.5) / 14) * Math.PI * 2;
                const inner = 5;
                const outer = 9;
                const x1 = 32 + Math.cos(a) * inner;
                const y1 = 32 + Math.sin(a) * inner;
                const x2 = 32 + Math.cos(a) * outer;
                const y2 = 32 + Math.sin(a) * outer;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} opacity="0.35" />;
              })}
            </g>

            {/* 9 — Crypts (small dark elongated patches) */}
            <g fill="hsl(15 55% 18%)" opacity="0.55">
              <ellipse cx="36" cy="28" rx="1.2" ry="0.5" transform="rotate(-30 36 28)" />
              <ellipse cx="28.5" cy="29.5" rx="1" ry="0.45" transform="rotate(40 28.5 29.5)" />
              <ellipse cx="38" cy="34" rx="1.4" ry="0.55" transform="rotate(20 38 34)" />
              <ellipse cx="27" cy="35" rx="1.1" ry="0.5" transform="rotate(-50 27 35)" />
              <ellipse cx="33" cy="37" rx="1" ry="0.45" transform="rotate(70 33 37)" />
              <ellipse cx="31.5" cy="27.5" rx="0.9" ry="0.4" transform="rotate(0 31.5 27.5)" />
            </g>

            {/* 10 — Collarette (irregular ring around pupil) */}
            <circle
              cx="32" cy="32" r="6.2"
              fill="none"
              stroke="hsl(28 60% 78%)"
              strokeOpacity="0.55"
              strokeWidth="0.6"
              strokeDasharray="1.8 0.9"
            />

            {/* 11 — Inner limbal ring (next to pupil) */}
            <circle cx="32" cy="32" r="4.5" fill="none" stroke="hsl(15 55% 18%)" strokeWidth="0.5" opacity="0.7" />

            {/* 12 — Pupil */}
            <circle cx="32" cy="32" r="4.1" fill="hsl(20 15% 6%)" className="oculo-pupil" />

            {/* 13a — Primary catchlight (upper-right soft blob) */}
            <ellipse cx="34.6" cy="29.4" rx="1.9" ry="1.4" fill="hsl(0 0% 100%)" opacity="0.95" />
            {/* 13b — Secondary smaller highlight */}
            <circle cx="29.8" cy="33.8" r="0.55" fill="hsl(0 0% 100%)" opacity="0.7" />
            {/* 13c — Rim catchlight along pupil edge */}
            <path
              d="M30.5 29.5 Q 32 28.6 33.5 29.4"
              fill="none"
              stroke="hsl(0 0% 100%)"
              strokeOpacity="0.55"
              strokeWidth="0.4"
              strokeLinecap="round"
            />
          </g>

          {/* 14 — Lower lid tear pool shadow */}
          <path
            d="M6 34 Q 32 49 58 34"
            fill="none"
            stroke="hsl(20 20% 18%)"
            strokeOpacity="0.18"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          {/* tear glint */}
          <ellipse cx="32" cy="48" rx="6" ry="0.6" fill="hsl(0 0% 100%)" opacity="0.18" />

          {/* 15 — Caruncle (inner pink corner) */}
          <ellipse cx="6.5" cy="33" rx="2" ry="1.6" fill="hsl(8 55% 70%)" opacity="0.7" />
          <circle cx="7" cy="33" r="0.6" fill="hsl(0 0% 100%)" opacity="0.45" />
        </g>

        {/* 16 — Eye outline */}
        <path
          d={ALMOND}
          fill="none"
          stroke={`url(#lid-${uid})`}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Inner-corner tuck for a sharper natural canthus */}
        <path d="M4 33 Q 6 32 8 32.5" fill="none" stroke={`url(#lid-${uid})`} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M60 33 Q 58 32.5 56 33" fill="none" stroke={`url(#lid-${uid})`} strokeWidth="1.4" strokeLinecap="round" />
      </g>

      {/* 17 — Upper lash row (outside mask so they sit on top of the lid even mid-blink) */}
      <g
        stroke={`url(#lid-${uid})`}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.85"
      >
        {/* Lashes pointing upward, following the upper-lid arc */}
        <line x1="13" y1="20" x2="11" y2="15.5" />
        <line x1="18" y1="16.5" x2="16.5" y2="11.5" />
        <line x1="23" y1="14.5" x2="22" y2="9.5" />
        <line x1="28" y1="13.5" x2="27.5" y2="8.5" />
        <line x1="32" y1="13" x2="32" y2="8" />
        <line x1="36" y1="13.5" x2="36.5" y2="8.5" />
        <line x1="41" y1="14.5" x2="42" y2="9.5" />
        <line x1="46" y1="16.5" x2="47.5" y2="11.5" />
        <line x1="51" y1="20" x2="53" y2="15.5" />
      </g>

      {/* 18 — Lower lash row (shorter, sparser, pointing downward) */}
      <g
        stroke={`url(#lid-${uid})`}
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.55"
      >
        <line x1="20" y1="49" x2="19.5" y2="52.5" />
        <line x1="26" y1="50.5" x2="25.5" y2="54" />
        <line x1="32" y1="51" x2="32" y2="54.6" />
        <line x1="38" y1="50.5" x2="38.5" y2="54" />
        <line x1="44" y1="49" x2="44.5" y2="52.5" />
      </g>
    </svg>
  );
}
