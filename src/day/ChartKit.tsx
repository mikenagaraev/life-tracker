import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { levelState, shortKey } from './analytics';
import type { DayState } from './types';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Подписи по оси X: сколько влезает (≈ одна на 56 px, не больше шести), первая и последняя всегда. */
function ticks(n: number, width: number): number[] {
  if (n <= 1) return [0];
  const k = Math.max(2, Math.min(n, 6, Math.floor(width / 56)));
  return [...new Set(Array.from({ length: k }, (_, j) => Math.round((j * (n - 1)) / (k - 1))))];
}

function usePick(n: number, x0: number, step: number) {
  const [sel, setSel] = useState<number | null>(null);
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = step ? Math.round((e.clientX - r.left - x0) / step) : 0;
    setSel(Math.max(0, Math.min(n - 1, i)));
  };
  return { sel, handlers: { onPointerMove: pick, onPointerDown: pick, onPointerLeave: () => setSel(null) } };
}

const anchor = (i: number, n: number) => (n > 1 ? (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') : 'middle');

const Diamond = ({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) => (
  <path d={`M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`} fill={fill} stroke="var(--ink2)" strokeOpacity={0.45} strokeWidth={1} />
);

/**
 * Уровень состояния по дням: шкала — состояния пользователя (снизу худшее), точка — цвет состояния.
 * bars — сколько сделано за день (бледные столбики под линией).
 */
export function LevelChart({ values, labels, scale, bars, label, tip }: {
  values: (number | null)[];
  labels: string[];
  scale: DayState[];
  bars?: number[];
  label: string;
  tip?: (i: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = values.length, N = scale.length;
  const rowH = 26, padT = 10, padB = 26, padX = 10;
  const H = padT + (N - 1) * rowH + padB;
  const W = Math.max(w, 120);
  const step = n > 1 ? (W - 2 * padX) / (n - 1) : 0;
  const x = (i: number) => (n > 1 ? padX + i * step : W / 2);
  const y = (v: number) => padT + (N - 1 - v) * rowH;
  const r = Math.max(3.5, Math.min(6, step / 2.4));
  const { sel, handlers } = usePick(n, padX, step);

  let path = '', pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  const maxBar = Math.max(1, ...(bars || []));
  const barH = (N - 1) * rowH * 0.45, bw = Math.max(3, Math.min(step * 0.55, 18));
  const tipText = (i: number) => (tip ? tip(i) : `${shortKey(labels[i])} — ${levelState(scale, values[i])?.name || 'нет оценки'}`);

  return (
    <div className="lchart">
      <div className="lchart-y" style={{ height: H }} aria-hidden>
        {scale.map((s, v) => (
          <span key={s.color + v} style={{ top: y(v) }}><i className="dia" style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
      <div ref={ref} className="chart-plot" {...handlers}>
        <svg width={W} height={H} role="img" aria-label={label}>
          {scale.map((_, v) => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line2)" />)}
          {bars?.map((b, i) => b > 0 && (
            <rect key={i} x={x(i) - bw / 2} y={y(0) - (barH * b) / maxBar} width={bw} height={(barH * b) / maxBar} rx={2} fill="var(--day)" opacity={0.28} />
          ))}
          {sel !== null && <line x1={x(sel)} x2={x(sel)} y1={padT - 6} y2={y(0)} stroke="var(--faint)" strokeDasharray="3 3" />}
          <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          {values.map((v, i) => v !== null && <Diamond key={i} cx={x(i)} cy={y(v)} r={sel === i ? r + 2 : r} fill={levelState(scale, v)!.color} />)}
          {ticks(n, W - 2 * padX).map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={anchor(i, n)} className="ctext">{shortKey(labels[i])}</text>)}
        </svg>
        {sel !== null && <div className="ctip" style={{ left: Math.max(70, Math.min(W - 70, x(sel))) }}>{tipText(sel)}</div>}
      </div>
    </div>
  );
}

/** Количество отметок по дням. */
export function CountChart({ values, labels, label }: { values: number[]; labels: string[]; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = values.length;
  const H = 170, padT = 12, padB = 26, padX = 10, axis = 26;
  const W = Math.max(w, 120);
  const step = n > 1 ? (W - axis - 2 * padX) / (n - 1) : 0;
  const x = (i: number) => axis + (n > 1 ? padX + i * step : (W - axis) / 2);
  const hh = H - padT - padB;
  const max = Math.max(1, ...values);
  const bw = Math.max(3, Math.min(step * 0.6, 20));
  const grid = max <= 2 ? [...new Set([0, 1 / max, 1])] : [0, 0.5, 1];
  const { sel, handlers } = usePick(n, axis + padX, step);

  return (
    <div ref={ref} className="chart-plot" {...handlers}>
      <svg width={W} height={H} role="img" aria-label={label}>
        {grid.map((f) => {
          const yy = padT + hh * (1 - f);
          return (
            <g key={f}>
              <line x1={axis} x2={W} y1={yy} y2={yy} stroke={f ? 'var(--line2)' : 'var(--line)'} />
              <text x={axis - 6} y={yy} textAnchor="end" dominantBaseline="central" className="ctext">{Math.round(max * f)}</text>
            </g>
          );
        })}
        {values.map((v, i) => v > 0 && (
          <rect key={i} x={x(i) - bw / 2} y={padT + hh - (hh * v) / max} width={bw} height={(hh * v) / max} rx={Math.min(4, bw / 2)}
            fill="var(--day)" opacity={sel === null || sel === i ? 1 : 0.55} />
        ))}
        {ticks(n, W - axis - 2 * padX).map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={anchor(i, n)} className="ctext">{shortKey(labels[i])}</text>)}
      </svg>
      {sel !== null && <div className="ctip" style={{ left: Math.max(60, Math.min(W - 60, x(sel))) }}>{shortKey(labels[sel])}: {values[sel]}</div>}
    </div>
  );
}
