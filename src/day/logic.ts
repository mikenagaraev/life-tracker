import type { DayData, DayItem, DayOp, DayState, OneOff } from './types';

export const PLAN = '#00ffff';
export const SKIP = /^(отмена|перенос)$/i;

/** Ключ столбца «Лист1»: '2026-11-21' → '21.11'. */
export function keyOf(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}`;
}

export function norm(color: string | undefined | null): string {
  const c = (color || '').toLowerCase();
  return c === '#ffffff' ? '' : c;
}

/** Отмечено = есть цвет, и это не план и не «Перенос»/«Отмена». Чужой цвет тоже считается отметкой. */
export function isDone(color: string, states: DayState[]): boolean {
  const c = norm(color);
  if (!c || c === PLAN) return false;
  const st = states.find((s) => s.color === c);
  return !(st && SKIP.test(st.name));
}

export function stateOf(color: string, states: DayState[]): { name: string; color: string } | null {
  const c = norm(color);
  if (!c) return null;
  if (c === PLAN) return { name: 'В планах', color: PLAN };
  return states.find((s) => s.color === c) || { name: 'Свой цвет', color: c };
}

export interface Category {
  name: string;
  row: number;
  items: DayItem[];
  oneoffs: OneOff[];
}

export interface DayModel {
  cats: Category[];
  solos: DayItem[];
  looseOneoffs: OneOff[]; // разовые без известной категории
}

/** Разложить строки листа по категориям: заголовок (sphere) — дальше его дела до следующего заголовка. */
export function buildModel(day: Pick<DayData, 'items' | 'oneoffs'>): DayModel {
  const cats: Category[] = [];
  const solos: DayItem[] = [];
  let cur: Category | null = null;
  for (const it of day.items) {
    if (it.solo) {
      if (!it.sphere || it.name === 'День' || it.name === 'Удовольствие') solos.push(it);
      continue;
    }
    if (it.sphere) {
      cur = { name: it.name, row: it.row, items: [], oneoffs: [] };
      cats.push(cur);
    } else if (cur) {
      cur.items.push(it);
    }
  }
  const loose: OneOff[] = [];
  for (const o of day.oneoffs) {
    const c = cats.find((x) => x.name === o.cat);
    if (c) c.oneoffs.push(o);
    else loose.push(o);
  }
  return { cats, solos: solos.filter((s) => s.name !== 'Другое' || s.color), looseOneoffs: loose };
}

export function progress(model: DayModel, states: DayState[]): { done: number; total: number } {
  let done = 0, total = 0;
  for (const c of model.cats) {
    for (const it of c.items) {
      total++;
      if (isDone(it.color, states)) done++;
    }
    for (const o of c.oneoffs) {
      total++;
      if (isDone(o.color, states)) done++;
    }
  }
  for (const o of model.looseOneoffs) {
    total++;
    if (isDone(o.color, states)) done++;
  }
  return { done, total };
}

export function catCounts(c: Category, states: DayState[]): { done: number; total: number; planned: number; colors: string[] } {
  const all = [...c.items.map((i) => i.color), ...c.oneoffs.map((o) => o.color)];
  return {
    done: all.filter((x) => isDone(x, states)).length,
    total: all.length,
    planned: all.filter((x) => norm(x) === PLAN).length,
    colors: all.map(norm), // '' — не отмечено (рисуется серым)
  };
}

/** Данные сервера + правки, которые ещё не дошли (оптимистичный вид). */
export function applyOps(day: DayData, ops: DayOp[]): DayData {
  let items = day.items;
  let oneoffs = day.oneoffs;
  let comment = day.comment;
  for (const op of ops) {
    if (op.iso !== day.iso) continue;
    if (op.kind === 'color') {
      items = items.map((it) => (it.row === op.row && it.name === op.name
        ? { ...it, color: op.color, planned: it.planned || op.color === PLAN }
        : it));
    } else if (op.kind === 'comment') {
      comment = op.text;
    } else if (op.kind === 'oneoffAdd') {
      if (!oneoffs.some((o) => o.id === op.oneId)) oneoffs = [...oneoffs, { id: op.oneId, name: op.name, color: op.color, cat: op.cat }];
    } else if (op.kind === 'oneoffColor') {
      oneoffs = oneoffs.map((o) => (o.id === op.oneId ? { ...o, color: op.color || PLAN } : o));
    } else if (op.kind === 'oneoffDelete') {
      oneoffs = oneoffs.filter((o) => o.id !== op.oneId);
    }
  }
  return items === day.items && oneoffs === day.oneoffs && comment === day.comment ? day : { ...day, items, oneoffs, comment };
}

/**
 * Сжать очередь: несколько отметок одного дела за день → одна (с самым первым «было»),
 * несколько правок комментария → последняя; созданное и удалённое без отправки разовое дело исчезает.
 */
export function compactOps(ops: DayOp[]): DayOp[] {
  const out: DayOp[] = [];
  for (const op of ops) {
    if (op.kind === 'color') {
      const i = out.findIndex((o) => o.kind === 'color' && o.iso === op.iso && o.row === op.row && o.name === op.name);
      if (i >= 0) {
        const first = out[i] as Extract<DayOp, { kind: 'color' }>;
        out.splice(i, 1);
        if (norm(first.prev) === norm(op.color)) continue; // вернули как было — правка не нужна
        out.push({ ...op, prev: first.prev });
        continue;
      }
    }
    if (op.kind === 'comment') {
      const i = out.findIndex((o) => o.kind === 'comment' && o.iso === op.iso);
      if (i >= 0) out.splice(i, 1);
    }
    if (op.kind === 'oneoffColor') {
      const add = out.find((o) => o.kind === 'oneoffAdd' && o.oneId === op.oneId) as Extract<DayOp, { kind: 'oneoffAdd' }> | undefined;
      if (add) { add.color = op.color || PLAN; continue; }
      const i = out.findIndex((o) => o.kind === 'oneoffColor' && o.oneId === op.oneId);
      if (i >= 0) out.splice(i, 1);
    }
    if (op.kind === 'oneoffDelete') {
      const hadAdd = out.some((o) => o.kind === 'oneoffAdd' && o.oneId === op.oneId);
      const kept = out.filter((o) => !('oneId' in o) || o.oneId !== op.oneId);
      out.splice(0, out.length, ...kept);
      if (hadAdd) continue; // создано и удалено без сети — серверу знать не нужно
    }
    out.push(op);
  }
  return out;
}

/** Поиск дела по всем категориям. */
export function searchItems(model: DayModel, q: string, limit = 15): { cat: string; item: DayItem }[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: { cat: string; item: DayItem }[] = [];
  for (const c of model.cats) for (const it of c.items) if (it.name.toLowerCase().includes(s)) out.push({ cat: c.name, item: it });
  return out.slice(0, limit);
}
