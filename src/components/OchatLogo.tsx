/**
 * OchatLogo — photorealistic animated eye for Ochat.
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
 * Animations (synced via window event "ochat:state"):
 *   - idle      : slow pupil dilation, micro saccades, occasional blink (~7s)
 *   - thinking  : faster gaze drift (looking around), pupil narrows
 *   - speaking  : faster blinks + glow halo intensifies
 *
 * Blink uses a two-half SVG mask that closes to the centreline — the
 * eye actually CLOSES instead of being squashed.
 */
import { useEffect, useState, useId } from "react";
import { cn } from "@/lib/utils";

export type OchatState = "idle" | "thinking" | "speaking";

interface Props {
  size?: number;
  state?: OchatState;
  className?: string;
  /** Use the brand iris gradient. Set false on coloured chips to inherit colour. */
  withGradient?: boolean;
}

export function setOchatState(s: OchatState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ochat:state", { detail: s }));
}

export function OchatLogo({ size = 24, state, className, withGradient = true }: Props) {
  const [internal, setInternal] = useState<OchatState>("idle");
  const uid = useId().replace(/:/g, "");
  const active = state ?? internal;

  useEffect(() => {
    if (state) return;
    const onState = (e: Event) => {
      const next = (e as CustomEvent<OchatState>).detail;
      if (next === "idle" || next === "thinking" || next === "speaking") setInternal(next);
    };
    window.addEventListener("ochat:state", onState as EventListener);
    return () => window.removeEventListener("ochat:state", onState as EventListener);
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
      aria-label="Ochat"
      className={cn("ochat-logo select-none", className)}
      style={
        {
          ["--ochat-blink-dur" as any]: blinkDur,
          ["--ochat-pupil-dur" as any]: pupilDur,
          ["--ochat-gaze-dur" as any]: gazeDur,
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

        {/* Mask: split into top & bottom halves that slide to close */}
        <mask id={`mask-${uid}`}>
          <rect x="0" y="0" width="64" height="64" fill="black" />
          <g>
            <path d={ALMOND} fill="white" />
          </g>
          <g className="ochat-mask-top">
            <rect x="-2" y="-2" width="68" height="34" fill="white" />
          </g>
          <g className="ochat-mask-bot">
            <rect x="-2" y="32" width="68" height="34" fill="white" />
          </g>
        </mask>
      </defs>

      {/* Halo glow */}
      <g
        className={cn(
          "ochat-glow",
          active === "speaking" ? "is-strong" : active === "thinking" ? "is-medium" : "",
        )}
      >
        <ellipse cx="32" cy="32" rx="25" ry="20" fill="hsl(var(--primary) / 0.7)" opacity="0.18" />
        <ellipse cx="32" cy="32" rx="18" ry="14" fill="hsl(var(--accent) / 0.6)" opacity="0.18" />
      </g>

      {/* Core eye group */}
      <g mask={`url(#mask-${uid})`}>
        {/* Brow shadow */}
        <path d="M7 28 Q 32 10 57 28" fill="none" stroke="hsl(0 0% 0% / 0.10)" strokeWidth="6" />

        {/* Upper lid shadow on sclera */}
        <path d={UPPER_LID} fill="none" stroke="hsl(0 0% 0% / 0.10)" strokeWidth="5" />

        {/* Sclera */}
        <path d={ALMOND} fill={`url(#sclera-${uid})`} />

        {/* Vein hint */}
        <path
          d="M16 36 C 18 34, 20 34, 22 36"
          fill="none"
          stroke="hsl(4 60% 55% / 0.20)"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        <path
          d="M43 38 C 45 36, 47 36, 49 38"
          fill="none"
          stroke="hsl(4 60% 55% / 0.16)"
          strokeWidth="0.8"
          strokeLinecap="round"
        />

        {/* Iris + pupil group that drifts for gaze */}
        <g className="ochat-gaze">
          {/* Limbal ring (outer) */}
          <circle cx="32" cy="32" r="15.5" fill="hsl(15 35% 18% / 0.35)" />

          {/* Iris */}
          <circle cx="32" cy="32" r="14.2" fill={`url(#iris-${uid})`} />

          {/* Stroma fibres */}
          {Array.from({ length: 28 }).map((_, i) => {
            const a = (i / 28) * Math.PI * 2;
            const x1 = 32 + Math.cos(a) * 3.5;
            const y1 = 32 + Math.sin(a) * 3.5;
            const x2 = 32 + Math.cos(a) * 13.2;
            const y2 = 32 + Math.sin(a) * 13.2;
            return (
              <path
                key={i}
                d={`M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`}
                stroke="hsl(15 45% 15% / 0.13)"
                strokeWidth="0.55"
                strokeLinecap="round"
              />
            );
          })}

          {/* Crypts / furrows */}
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2 + 0.25;
            const cx = 32 + Math.cos(a) * 6.7;
            const cy = 32 + Math.sin(a) * 6.7;
            return (
              <ellipse
                key={i}
                cx={cx}
                cy={cy}
                rx="3.2"
                ry="1.2"
                transform={`rotate(${(a * 180) / Math.PI} ${cx} ${cy})`}
                fill="hsl(15 55% 20% / 0.12)"
              />
            );
          })}

          {/* Collarette */}
          <path
            d="M32 19.6
               C 27.2 20.1, 23.3 24.0, 23.0 28.8
               C 22.7 34.6, 27.0 38.9, 32.0 39.4
               C 37.0 38.9, 41.3 34.6, 41.0 28.8
               C 40.7 24.0, 36.8 20.1, 32.0 19.6 Z"
            fill="none"
            stroke="hsl(15 60% 18% / 0.18)"
            strokeWidth="1.0"
            strokeLinejoin="round"
          />

          {/* Limbal ring (inner) */}
          <circle cx="32" cy="32" r="6.8" fill="hsl(15 35% 10% / 0.28)" />

          {/* Pupil */}
          <circle className="ochat-pupil" cx="32" cy="32" r="6.2" fill="hsl(0 0% 4%)" />

          {/* Catchlights */}
          <path
            d="M38.5 25.2 C 41.5 25.8, 43.1 28.1, 42.6 30.7 C 42.1 33.4, 39.8 34.7, 37.0 34.1 C 34.1 33.5, 32.5 31.2, 33.0 28.6 C 33.5 26.0, 35.7 24.6, 38.5 25.2 Z"
            fill="hsl(0 0% 100% / 0.92)"
          />
          <circle cx="28.5" cy="29.2" r="1.05" fill="hsl(0 0% 100% / 0.50)" />
          <path
            d="M45.0 32.8 C 44.2 35.9, 42.5 38.8, 40.2 41.0"
            fill="none"
            stroke="hsl(0 0% 100% / 0.14)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>

        {/* Lower lid shadow */}
        <path d="M10 38 Q 32 50 54 38" fill="none" stroke="hsl(0 0% 0% / 0.08)" strokeWidth="3.8" />

        {/* Caruncle (tear duct) */}
        <path
          d="M9.5 33.5 C 10.8 31.8, 12.9 31.6, 14.4 32.6 C 15.6 33.4, 15.8 35.2, 14.8 36.4 C 13.6 37.8, 11.3 37.8, 10.1 36.3 C 9.1 35.0, 8.8 34.3, 9.5 33.5 Z"
          fill="hsl(10 70% 70% / 0.70)"
        />

        {/* Eye outline */}
        <path d={ALMOND} fill="none" stroke={`url(#lid-${uid})`} strokeWidth="1.6" opacity="0.9" />

        {/* Upper lashes */}
        {Array.from({ length: 10 }).map((_, i) => {
          const t = i / 9;
          const x = 7 + t * 50;
          const y = 31 - Math.sin(t * Math.PI) * 9.5;
          const dx = (t - 0.5) * 1.6;
          return (
            <path
              key={i}
              d={`M${x.toFixed(1)} ${y.toFixed(1)} Q ${(x + dx).toFixed(1)} ${(y - 3.0).toFixed(1)} ${(x + dx * 1.6).toFixed(1)} ${(y - 6.0).toFixed(1)}`}
              fill="none"
              stroke="hsl(0 0% 0% / 0.18)"
              strokeWidth="0.9"
              strokeLinecap="round"
            />
          );
        })}

        {/* Lower lashes */}
        {Array.from({ length: 8 }).map((_, i) => {
          const t = i / 7;
          const x = 10 + t * 44;
          const y = 39 + Math.sin(t * Math.PI) * 7.0;
          const dx = (t - 0.5) * 1.2;
          return (
            <path
              key={i}
              d={`M${x.toFixed(1)} ${y.toFixed(1)} Q ${(x + dx).toFixed(1)} ${(y + 2.2).toFixed(1)} ${(x + dx * 1.4).toFixed(1)} ${(y + 4.2).toFixed(1)}`}
              fill="none"
              stroke="hsl(0 0% 0% / 0.14)"
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          );
        })}
      </g>
    </svg>
  );
}

