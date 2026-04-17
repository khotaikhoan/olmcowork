import { useMemo, useState, useEffect } from "react";

export interface CursorPoint {
  x: number;
  y: number;
  /** "move" | "click" | "type" | "key" — affects rendering */
  kind?: string;
  /** 0..1 opacity multiplier; later points draw brighter */
  t?: number;
  label?: string;
}

interface Props {
  /** base64 PNG (no prefix) */
  image: string;
  /** ordered points captured from a sequence of computer.* tool calls */
  points: CursorPoint[];
  /** original screenshot pixel size */
  width?: number;
  height?: number;
}

/**
 * Replays the AI's mouse path over a screenshot:
 *   - polyline trail (cyan) connecting moves in order
 *   - pulsing circle on each click
 *   - numbered badge for each waypoint
 * Auto-fits the SVG viewBox to the image's natural size.
 */
export function CursorTrailOverlay({ image, points, width, height }: Props) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(
    width && height ? { w: width, h: height } : null,
  );

  useEffect(() => {
    if (nat) return;
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = `data:image/png;base64,${image}`;
  }, [image, nat]);

  const polyline = useMemo(
    () => points.map((p) => `${p.x},${p.y}`).join(" "),
    [points],
  );

  const W = nat?.w ?? 1280;
  const H = nat?.h ?? 800;

  return (
    <div className="relative inline-block max-w-full">
      <img
        src={`data:image/png;base64,${image}`}
        alt="cursor trail"
        className="block max-w-full h-auto rounded-md border border-border"
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
      >
        {points.length >= 2 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="hsl(190 90% 55%)"
            strokeWidth={Math.max(2, W / 600)}
            strokeDasharray="6 4"
            opacity={0.85}
          />
        )}
        {points.map((p, i) => {
          const r = Math.max(8, W / 120);
          const isClick = p.kind === "click" || p.kind === "left_click" || p.kind === "right_click";
          return (
            <g key={i}>
              {isClick && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r * 1.6}
                  fill="hsl(0 90% 60% / 0.18)"
                  stroke="hsl(0 90% 60%)"
                  strokeWidth={2}
                >
                  <animate
                    attributeName="r"
                    values={`${r};${r * 2.2};${r}`}
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.9;0.2;0.9"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={isClick ? "hsl(0 90% 55%)" : "hsl(190 90% 55%)"}
                stroke="white"
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={p.y + r * 0.4}
                textAnchor="middle"
                fontSize={r * 1.1}
                fontWeight={700}
                fill="white"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
