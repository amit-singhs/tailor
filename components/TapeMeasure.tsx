/**
 * The overall score as a measuring tape pulled out from 0 to the score.
 * The faint track shows how far there is to 10. Animates once per result.
 */
import { useId } from 'react';

const W = 320;
const X0 = 14; // tape start
const X10 = 306; // 10 mark
const TAPE_Y = 16;
const TAPE_H = 28;

const xFor = (v: number) => X0 + (Math.max(0, Math.min(10, v)) / 10) * (X10 - X0);

export function TapeMeasure({ value, animateKey }: { value: number; animateKey?: string }) {
  const clip = useId();
  const end = xFor(value);
  const ticks = Array.from({ length: 41 }, (_, i) => i / 4); // quarter marks

  return (
    <svg
      key={animateKey}
      viewBox={`0 0 ${W} 72`}
      className="block w-full"
      role="img"
      aria-label={`Fit score ${value.toFixed(1)} out of 10`}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={X0} y={TAPE_Y} width={Math.max(0, end - X0)} height={TAPE_H} className="tape-pull" />
        </clipPath>
      </defs>

      {/* Track to 10: where the tape could reach */}
      <rect x={X0} y={TAPE_Y} width={X10 - X0} height={TAPE_H} rx={3} fill="var(--sunken)" />
      {ticks.map((t) => {
        const major = Number.isInteger(t);
        const half = !major && Number.isInteger(t * 2);
        const h = major ? 12 : half ? 8 : 5;
        return (
          <line key={`t${t}`} x1={xFor(t)} x2={xFor(t)} y1={TAPE_Y} y2={TAPE_Y + h} stroke="var(--line)" strokeWidth={major ? 1.4 : 1} />
        );
      })}

      {/* The pulled-out tape */}
      <g clipPath={`url(#${clip})`}>
        <rect x={X0} y={TAPE_Y} width={X10 - X0} height={TAPE_H} rx={3} fill="var(--tape)" />
        <rect x={X0} y={TAPE_Y + TAPE_H - 2} width={X10 - X0} height={2} fill="var(--tape-edge)" />
        {ticks.map((t) => {
          const major = Number.isInteger(t);
          const half = !major && Number.isInteger(t * 2);
          const h = major ? 12 : half ? 8 : 5;
          return (
            <line key={`y${t}`} x1={xFor(t)} x2={xFor(t)} y1={TAPE_Y} y2={TAPE_Y + h} stroke="var(--tape-ink)" strokeWidth={major ? 1.4 : 1} />
          );
        })}
        {ticks.filter((t) => Number.isInteger(t) && t > 0 && t < 10).map((t) => (
          <text key={`n${t}`} x={xFor(t)} y={TAPE_Y + 23} textAnchor="middle" fontSize="8.5" fontWeight={600} fill="var(--tape-ink)" className="tabular">
            {t}
          </text>
        ))}
      </g>

      {/* End hook at the score */}
      <g className="hook-slide" style={{ ['--hook-from' as string]: `${X0 - end}px` }}>
        <rect x={end - 2} y={TAPE_Y - 6} width={4} height={TAPE_H + 12} rx={1.5} fill="var(--ink)" />
      </g>

      {/* 0 and 10 labels on the track */}
      <text x={X0} y={66} fontSize="10" fill="var(--muted)" textAnchor="start" className="tabular">
        0
      </text>
      <text x={X10} y={66} fontSize="10" fill="var(--muted)" textAnchor="end" className="tabular">
        10
      </text>
    </svg>
  );
}

/** A thin tape for a single skill, 0..10. */
export function MiniTape({ value, tone }: { value: number; tone: 'fit' | 'partial' | 'gap' | 'muted' }) {
  const pct = Math.max(0, Math.min(10, value)) * 10;
  const fill = {
    fit: 'var(--tape)',
    partial: 'var(--tape)',
    gap: 'var(--gap)',
    muted: 'var(--line)',
  }[tone];
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: fill, opacity: tone === 'gap' ? 0.55 : 1 }} />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(to right, transparent 0 calc(10% - 1px), color-mix(in oklab, var(--tape-ink) 25%, transparent) calc(10% - 1px) 10%)',
        }}
      />
    </div>
  );
}
