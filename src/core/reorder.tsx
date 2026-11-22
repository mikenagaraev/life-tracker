import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';

/**
 * Новое место перетаскиваемой строки: сколько других строк выше её центра.
 * mids — середины строк (в координатах страницы), from — откуда тащим, center — где сейчас центр.
 */
export function dropIndex(mids: number[], from: number, center: number): number {
  let to = 0;
  mids.forEach((m, i) => { if (i !== from && m < center) to++; });
  return to;
}

/** Переставить элемент массива. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const out = arr.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

interface Drag { id: string; from: number; to: number; dy: number; h: number }

/**
 * Перетаскивание пальцем за ручку (⠿): строка едет за пальцем, остальные раздвигаются.
 * Отпустили на новом месте — onDrop(from, to). Работает на таче (pointer events + touch-action: none на ручке).
 */
export function useReorder(ids: string[], onDrop: (from: number, to: number) => void, enabled = true) {
  const els = useRef(new Map<string, HTMLElement>());
  const st = useRef<{ from: number; y0: number; tops: number[]; mids: number[]; h: number; id: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(id, el); else els.current.delete(id);
  };

  const end = (commit: boolean) => {
    const s = st.current, d = drag;
    st.current = null;
    setDrag(null);
    document.body.classList.remove('dragging');
    if (commit && s && d && d.to !== s.from) onDrop(s.from, d.to);
  };

  const grip = (id: string) => ({
    style: { touchAction: 'none', cursor: enabled ? 'grab' : 'default' } as CSSProperties,
    disabled: !enabled || ids.length < 2,
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (!enabled || e.button > 0) return;
      e.preventDefault();
      const from = ids.indexOf(id);
      if (from < 0) return;
      const rects = ids.map((x) => els.current.get(x)?.getBoundingClientRect());
      if (rects.some((r) => !r)) return;
      const sy = window.scrollY;
      const tops = rects.map((r) => r!.top + sy);
      st.current = { id, from, y0: e.clientY + sy, tops, mids: rects.map((r) => r!.top + sy + r!.height / 2), h: rects[from]!.height };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* синтетические события */ }
      document.body.classList.add('dragging');
      setDrag({ id, from, to: from, dy: 0, h: rects[from]!.height });
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const s = st.current;
      if (!s) return;
      e.preventDefault();
      if (e.clientY < 70) window.scrollBy(0, -10);
      else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 10);
      const dy = e.clientY + window.scrollY - s.y0;
      const to = dropIndex(s.mids, s.from, s.mids[s.from] + dy);
      setDrag({ id: s.id, from: s.from, to, dy, h: s.h });
    },
    onPointerUp() { end(true); },
    onPointerCancel() { end(false); },
  });

  /** Сдвиг строки во время перетаскивания. */
  const styleFor = (id: string): CSSProperties | undefined => {
    if (!drag) return undefined;
    const i = ids.indexOf(id);
    if (id === drag.id) {
      return { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 5, background: 'var(--card)', boxShadow: 'var(--shadow)', borderRadius: 12 };
    }
    let shift = 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.h;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) shift = drag.h;
    return { transform: shift ? `translateY(${shift}px)` : undefined, transition: 'transform .15s ease' };
  };

  return { register, grip, styleFor, dragging: drag?.id || null };
}
