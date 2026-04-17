/**
 * OculoIntro — full-screen morph intro played once per session.
 *
 * Sequence (~1.2s):
 *   0.00s  tiny dot in the middle
 *   0.30s  dot expands into pupil
 *   0.55s  iris ring + eye lid sweep open
 *   0.95s  wordmark "Oculo" fades in
 *   1.20s  overlay fades out & unmounts → app reveals
 *
 * Plays only once per browser session (sessionStorage flag).
 */
import { useEffect, useState } from "react";

const SESSION_KEY = "oculo.intro.played";

export function OculoIntro() {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setShow(true);

    const fadeTimer = setTimeout(() => setFading(true), 1200);
    const removeTimer = setTimeout(() => setShow(false), 1700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className="oculo-intro-overlay"
      data-fading={fading ? "true" : "false"}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        width={140}
        height={140}
        className="oculo-intro-mark"
        role="img"
        aria-label="Oculo"
      >
        <defs>
          <linearGradient id="oculo-intro-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
          <radialGradient id="oculo-intro-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Eye lid — sweeps open */}
        <path
          className="oculo-intro-lid"
          d="M6 32 Q 32 6 58 32 Q 32 58 6 32 Z"
          fill="none"
          stroke="url(#oculo-intro-grad)"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* Iris ring — fades + scales in */}
        <circle
          className="oculo-intro-ring"
          cx="32"
          cy="32"
          r="13"
          fill="url(#oculo-intro-grad)"
          fillOpacity="0.18"
          stroke="url(#oculo-intro-grad)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />

        {/* Glow */}
        <circle className="oculo-intro-glow" cx="32" cy="32" r="14" fill="url(#oculo-intro-glow)" />

        {/* Pupil — starts as a tiny dot, scales up */}
        <circle
          className="oculo-intro-pupil"
          cx="32"
          cy="32"
          r="4.5"
          fill="url(#oculo-intro-grad)"
        />

        {/* Catchlight */}
        <circle
          className="oculo-intro-catch"
          cx="35"
          cy="29"
          r="1.4"
          fill="hsl(var(--primary-foreground))"
          opacity="0.9"
        />
      </svg>

      <div className="oculo-intro-word">Oculo</div>
    </div>
  );
}
