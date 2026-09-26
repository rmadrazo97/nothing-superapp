'use client';

/**
 * WeightTrendChart — inline SVG weight chart shared by the compact card
 * and the expanded history sheet (v0.6.4).
 *
 * Layers (back → front):
 *   - y grid + labels, x date ticks
 *   - dashed goal line (cadmium red — the only accent in the chart)
 *   - raw weigh-ins: faint line + dots (daily noise, de-emphasised)
 *   - 7-day moving average: solid display-white line (the actual trend)
 *   - scrub cursor (interactive only): vertical rule + ringed dot
 *
 * The SVG viewBox tracks the rendered pixel width (ResizeObserver) so text
 * is drawn at true size — the old fixed 640-wide viewBox shrank 10px labels
 * to ~5px on a phone.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { WeightUnit } from '@nothing/shared';
import { movingAverage, nearestIndex, type WeightPoint } from '../lib/weight-trend.ts';

const LB_PER_KG = 2.20462;
const toUnit = (kg: number, unit: WeightUnit) => (unit === 'lb' ? kg * LB_PER_KG : kg);
const DAY_MS = 24 * 60 * 60 * 1000;

export type ScrubInfo = { point: WeightPoint; avg: number } | null;

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

function dateTick(t: number, spanDays: number): string {
  const d = new Date(t);
  const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  if (spanDays > 150) return `${mon} '${String(d.getFullYear()).slice(2)}`;
  return `${mon} ${String(d.getDate()).padStart(2, '0')}`;
}

export default function WeightTrendChart({
  points,
  unit,
  goalKg,
  height = 180,
  interactive = false,
  onScrub,
}: {
  /** Oldest → newest, kg. */
  points: WeightPoint[];
  unit: WeightUnit;
  goalKg: number | null;
  height?: number;
  interactive?: boolean;
  onScrub?: (info: ScrubInfo) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset the cursor when the data window changes (range chip tapped).
  const onScrubRef = useRef(onScrub);
  useEffect(() => {
    onScrubRef.current = onScrub;
  }, [onScrub]);
  useEffect(() => {
    setActive(null);
    onScrubRef.current?.(null);
  }, [points]);

  const ma = useMemo(() => movingAverage(points), [points]);

  if (points.length === 0) return <div ref={wrapRef} style={{ height }} />;

  const PAD_L = 40;
  const PAD_R = 10;
  const PAD_T = 10;
  const PAD_B = 22;
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tRange = Math.max(DAY_MS, tMax - tMin);
  const spanDays = tRange / DAY_MS;

  // Y domain in the display unit so grid labels land on round numbers.
  const vals = points.map((p) => toUnit(p.kg, unit));
  if (goalKg != null) vals.push(toUnit(goalKg, unit));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 2) {
    const mid = (hi + lo) / 2;
    lo = mid - 1;
    hi = mid + 1;
  }
  const step = niceStep(hi - lo, height >= 240 ? 5 : 3);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const yTicks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) yTicks.push(v);

  const x = (t: number) =>
    points.length === 1 ? PAD_L + plotW / 2 : PAD_L + ((t - tMin) / tRange) * plotW;
  const y = (kg: number) => PAD_T + (1 - (toUnit(kg, unit) - lo) / (hi - lo)) * plotH;

  const pathOf = (pts: WeightPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');

  const xTickCount = width < 360 ? 3 : 4;
  const xTicks =
    points.length === 1
      ? [tMin]
      : Array.from({ length: xTickCount }, (_, i) => tMin + (tRange * i) / (xTickCount - 1));

  const many = points.length > 60;
  const goalY = goalKg != null ? y(goalKg) : null;

  const scrubAt = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const t = tMin + ((px - PAD_L) / plotW) * tRange;
    const idx = nearestIndex(points, t);
    if (idx < 0) return;
    setActive(idx);
    onScrub?.({ point: points[idx], avg: ma[idx].kg });
  };

  const cur = active != null ? points[active] : null;

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <svg
        role="img"
        aria-label={`Weight trend, ${points.length} weigh-ins`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        style={{
          display: 'block',
          width: '100%',
          height,
          touchAction: interactive ? 'none' : undefined,
          cursor: interactive ? 'crosshair' : undefined,
          userSelect: 'none',
        }}
        onPointerDown={
          interactive
            ? (e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                scrubAt(e);
              }
            : undefined
        }
        onPointerMove={interactive ? scrubAt : undefined}
      >
        {yTicks.map((v) => {
          const py = PAD_T + (1 - (v - lo) / (hi - lo)) * plotH;
          return (
            <g key={v}>
              <line x1={PAD_L} y1={py} x2={width - PAD_R} y2={py} stroke="var(--color-border)" strokeWidth={1} />
              <text
                x={PAD_L - 6}
                y={py + 3.5}
                textAnchor="end"
                fontSize={10}
                fontFamily="var(--font-label)"
                fill="var(--color-text-disabled)"
              >
                {Number.isInteger(step) ? v.toFixed(0) : v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={height - 6}
            textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            fontFamily="var(--font-label)"
            fill="var(--color-text-disabled)"
          >
            {dateTick(t, spanDays)}
          </text>
        ))}

        {goalY != null && goalY >= PAD_T - 1 && goalY <= PAD_T + plotH + 1 && (
          <line
            x1={PAD_L}
            y1={goalY}
            x2={width - PAD_R}
            y2={goalY}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}

        {/* Raw weigh-ins — de-emphasised */}
        {points.length > 1 && (
          <path
            d={pathOf(points)}
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeOpacity={0.35}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.t)}
            cy={y(p.kg)}
            r={many ? 1.5 : 2.5}
            fill="var(--color-text-secondary)"
            fillOpacity={many ? 0.5 : 0.8}
          />
        ))}

        {/* 7-day trend */}
        {ma.length > 1 && (
          <path
            d={pathOf(ma)}
            fill="none"
            stroke="var(--color-text-display)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {cur && active != null && (
          <g pointerEvents="none">
            <line
              x1={x(cur.t)}
              y1={PAD_T}
              x2={x(cur.t)}
              y2={PAD_T + plotH}
              stroke="var(--color-text-secondary)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle cx={x(cur.t)} cy={y(ma[active].kg)} r={3} fill="var(--color-text-display)" />
            <circle
              cx={x(cur.t)}
              cy={y(cur.kg)}
              r={5}
              fill="var(--color-bg)"
              stroke="var(--color-text-display)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
