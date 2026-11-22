import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { toast } from '../core/ui';
import { useDay } from './store';
import type { DrawType, Stroke } from './types';

/** Лимит ячейки таблицы 50 000 символов; сервер принимает до 48 000. */
export const MAX_DRAWING = 48000;
const SAVE_DELAY = 1200;

export function parseStrokes(json: string): Stroke[] {
  try {
    const v = json ? JSON.parse(json) : [];
    return Array.isArray(v) ? v.filter((s) => s && Array.isArray(s.p)) : [];
  } catch {
    return [];
  }
}

/** Добавить точку, если палец сдвинулся заметно (как в полной версии: меньше точек — меньше данных). */
export function addPoint(p: number[], x: number, y: number): boolean {
  const n = p.length;
  if (n >= 2 && Math.abs(x - p[n - 2]) + Math.abs(y - p[n - 1]) < 6) return false;
  p.push(x, y);
  return true;
}

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/**
 * Холст рисунка дня. Линии хранятся в долях 0–1000 — рисунок одинаковый на любом экране и в полной версии.
 * Сохраняется сам через секунду после последней линии (через очередь — работает и без сети).
 */
export function Sketch({ iso, dtype, value, height, colors, amp, label }: {
  iso: string; dtype: DrawType; value: string; height: number; colors: string[]; amp?: boolean; label: string;
}) {
  const setDrawing = useDay((s) => s.setDrawing);
  const queued = useDay((s) => s.queue.some((o) => o.kind === 'drawing' && o.iso === iso && o.dtype === dtype));
  const offline = useDay((s) => s.net === 'offline');
  const [strokes, setStrokes] = useState<Stroke[]>(() => parseStrokes(value));
  const [history, setHistory] = useState<Stroke[][]>([]);
  const [color, setColor] = useState(colors[0]);
  const [pending, setPending] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const cur = useRef<Stroke | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<string | null>(null); // несохранённая версия
  const saved = useRef(value);

  // пришла новая версия из таблицы (обновление дня) — показываем, если сами ничего не рисуем
  useEffect(() => {
    if (value !== saved.current && latest.current === null && !cur.current) {
      saved.current = value;
      setStrokes(parseStrokes(value));
      setHistory([]);
    }
  }, [value]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const data = latest.current;
    if (data === null) return;
    latest.current = null;
    setPending(false);
    if (data.length > MAX_DRAWING) { toast('Рисунок слишком подробный — отмени пару линий'); return; }
    saved.current = data;
    setDrawing(iso, dtype, data);
  }, [iso, dtype, setDrawing]);
  useEffect(() => flush, [flush]); // ушли с этого дня — сохраняем сразу

  function commit(next: Stroke[]) {
    setHistory((h) => [...h.slice(-30), strokes]);
    setStrokes(next);
    latest.current = next.length ? JSON.stringify(next) : '';
    setPending(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }

  const draw = useCallback(() => {
    const c = cv.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height, k = window.devicePixelRatio || 1;
    g.clearRect(0, 0, W, H);
    if (amp) {
      g.strokeStyle = css('--line'); g.lineWidth = k; g.fillStyle = css('--muted'); g.font = `${10 * k}px Inter, system-ui, sans-serif`;
      g.setLineDash([4 * k, 4 * k]); g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
      const hours = [6, 9, 12, 15, 18, 21, 24];
      hours.forEach((h, i) => {
        const x = (i / (hours.length - 1)) * (W - 24 * k) + 12 * k;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H - 14 * k); g.stroke();
        g.textAlign = i === 0 ? 'left' : i === hours.length - 1 ? 'right' : 'center';
        g.fillText(`${h}:00`, i === 0 ? 2 * k : i === hours.length - 1 ? W - 2 * k : x, H - 3 * k);
      });
      g.textAlign = 'left'; g.fillText('высоко', 4 * k, 12 * k); g.fillText('низко', 4 * k, H - 18 * k);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    const ink = css('--ink');
    for (const s of cur.current ? [...strokes, cur.current] : strokes) {
      g.strokeStyle = s.c === 'ink' ? ink : s.c; g.lineWidth = s.w * k; g.beginPath();
      for (let i = 0; i < s.p.length; i += 2) {
        const x = (s.p[i] / 1000) * W, y = (s.p[i + 1] / 1000) * H;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      if (s.p.length === 2) g.lineTo((s.p[0] / 1000) * W + 0.1, (s.p[1] / 1000) * H);
      g.stroke();
    }
  }, [strokes, amp]);

  useLayoutEffect(() => {
    const c = cv.current;
    if (!c) return;
    const size = () => {
      const r = c.getBoundingClientRect(), k = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
      draw();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', draw);
    return () => { ro.disconnect(); mq.removeEventListener('change', draw); };
  }, [draw]);

  const pt = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* без захвата линия всё равно рисуется */ }
    cur.current = { c: color, w: 3, p: pt(e) };
    draw();
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!cur.current) return;
    e.preventDefault();
    const [x, y] = pt(e);
    if (addPoint(cur.current.p, x, y)) draw();
  };
  const up = () => {
    const s = cur.current;
    if (!s) return;
    cur.current = null;
    commit([...strokes, s]);
  };

  const status = pending ? 'Сохраняю…' : queued ? (offline ? 'Сохранено на телефоне — уйдёт в таблицу с сетью' : 'Отправляю…') : strokes.length ? 'Сохранено' : '';

  return (
    <div className="col" style={{ gap: 8 }}>
      <canvas ref={cv} className="sketch" style={{ height }} role="img" aria-label={label}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {colors.length > 1 && colors.map((c) => (
          <button key={c} type="button" className={'sk-color' + (c === color ? ' on' : '')} aria-pressed={c === color}
            aria-label={c === 'ink' ? 'Цвет: основной' : `Цвет ${c}`} style={{ background: c === 'ink' ? 'var(--ink)' : c }} onClick={() => setColor(c)} />
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="chip" disabled={!history.length} onClick={() => {
          const prev = history[history.length - 1];
          setHistory(history.slice(0, -1));
          setStrokes(prev);
          latest.current = prev.length ? JSON.stringify(prev) : '';
          setPending(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, SAVE_DELAY);
        }}>Отменить</button>
        <button type="button" className="chip" disabled={!strokes.length} onClick={() => commit([])}>Стереть</button>
      </div>
      {status && <div className="muted">{status}</div>}
    </div>
  );
}
