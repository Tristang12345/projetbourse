/**
 * Sparkline — Inline mini-chart for P&L trend visualization.
 * Pure SVG, no external dependency.
 */

import React from "react";

interface SparklineProps {
  data:   number[];
  width?: number;
  height?: number;
  color?: string;   // override; defaults to green/red based on trend
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width  = 80,
  height = 28,
  color,
}) => {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="bg-terminal-muted/20 rounded" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const trend = data[data.length - 1] >= data[0];
  const lineColor = color ?? (trend ? "#00e676" : "#ff1744");
  const fillColor = trend ? "rgba(0,230,118,0.08)" : "rgba(255,23,68,0.08)";

  const polyline = pts.join(" ");
  const area = [
    `0,${height}`,
    ...pts,
    `${width},${height}`,
  ].join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      {/* Area fill */}
      <polygon points={area} fill={fillColor} />
      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dot at last point */}
      {pts.length > 0 && (() => {
        const last = pts[pts.length - 1].split(",");
        return (
          <circle
            cx={last[0]}
            cy={last[1]}
            r="2"
            fill={lineColor}
          />
        );
      })()}
    </svg>
  );
};
