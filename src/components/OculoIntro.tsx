/**
 * OculoIntro — Apple-style cinematic intro played once per session.
 *
 * Design principles (Apple HIG-inspired):
 *   • Single hero element (the eye mark) — no busy concurrent motion.
 *   • Spring easing: cubic-bezier(0.32, 0.72, 0, 1) — Apple's signature curve.
 *   • Blur-to-focus reveal (mimics camera autofocus / iOS app launch).
 *   • Subtle scale (1.08 → 1.0), never bouncy. Confident, not playful.
 *   • Wordmark rises in sync, with letter-spacing settling (kerning ease).
 *   • Soft radial spotlight pulses behind mark for depth.
 *
 * Sequence (~1.6s, then 400ms exit fade):
 *   0.00s  Background spotlight fades in
 *   0.10s  Mark appears blurred + scaled-up, focuses to crisp
 *   0.55s  Wordmark letters settle into place
 *   1.30s  Hold beat
 *   1.60s  Overlay fades + blurs out → app reveals
 */
import { useEffect, useState } from "react";

const SESSION_KEY = "oculo.intro.played";

export function OculoIntro() {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // ?intro=1 forces replay (handy for testing) — clears the session flag.
    const force = new URLSearchParams(window.location.search).get("intro") === "1";
    if (force) sessionStorage.removeItem(SESSION_KEY);
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setShow(true);

    const fadeTimer = setTimeout(() => setFading(true), 1600);
    const removeTimer = setTimeout(() => setShow(false), 2050);
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
      {/* Soft radial spotlight backdrop */}
      <div className="oculo-intro-spotlight" />

      <div className="oculo-intro-stage">
        <svg
          viewBox="0 0 64 64"
          width={120}
          height={120}
          className="oculo-intro-mark"
          role="img"
          aria-label="Oculo"
        >
          <defs>
            <linearGradient id="oculo-intro-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--accent))" />
            </linearGradient>
            <radialGradient id="oculo-intro-iris" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
              <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.35" />
            </radialGradient>
          </defs>

          {/* Almond eye outline */}
          <path
            d="M6 32 Q 32 6 58 32 Q 32 58 6 32 Z"
            fill="none"
            stroke="url(#oculo-intro-grad)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />

          {/* Iris fill */}
          <circle cx="32" cy="32" r="13" fill="url(#oculo-intro-iris)" />

          {/* Iris ring */}
          <circle
            cx="32"
            cy="32"
            r="13"
            fill="none"
            stroke="url(#oculo-intro-grad)"
            strokeWidth="1.4"
            opacity="0.7"
          />

          {/* Pupil */}
          <circle cx="32" cy="32" r="5" fill="hsl(var(--foreground))" />

          {/* Catchlight */}
          <circle cx="34.5" cy="29.5" r="1.6" fill="hsl(var(--background))" opacity="0.95" />
          <circle cx="29" cy="33" r="0.7" fill="hsl(var(--background))" opacity="0.6" />
        </svg>

        <div className="oculo-intro-word" aria-hidden="true">
          {"Oculo".split("").map((ch, i) => (
            <span
              key={i}
              className="oculo-intro-letter"
              style={{ animationDelay: `${0.55 + i * 0.05}s` }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
