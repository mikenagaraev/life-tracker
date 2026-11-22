import type { DayData, DayItem, DayOp, DayState, OneOff } from './types';

export const PLAN = '#00ffff';
export const SKIP = /^(отмена|перенос)$/i;

/** Год, в котором столбцы «Лист1» подписаны без года. */
export const BASE_YEAR = 2026;

/** Ключ столбца «Лист1»: '2026-11-21' → '21.11', '2027-01-01' → '1.1.2027'. */
export function keyOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}.${m}${y === BASE_YEAR ? '' : `.${y}`}`;
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

/* ---------- перемещения (moveRow / moveCategory в Code.gs: строка «перед которой» вставить) ---------- */

/** Куда вставить дело при сдвиге на одну позицию внутри категории; null — дальше некуда. */
export function itemMoveTarget(cat: Category, index: number, dir: -1 | 1): number | null {
  const items = cat.items;
  if (dir < 0) return index > 0 ? items[index - 1].row : null;
  return index < items.length - 1 ? items[index + 1].row + 1 : null;
}

/** Куда вставить блок категории при сдвиге на одну позицию; null — дальше некуда. */
export function categoryMoveTarget(model: DayModel, index: number, dir: -1 | 1): number | null {
  const cats = model.cats;
  if (dir < 0) return index > 0 ? cats[index - 1].row : null;
  if (index >= cats.length - 1) return null;
  const afterNext = cats[index + 2];
  if (afterNext) return afterNext.row;
  if (model.solos.length) return Math.min(...model.solos.map((s) => s.row));
  const next = cats[index + 1];
  return Math.max(next.row, ...next.items.map((i) => i.row)) + 1;
}

/* ---------- редактор состояний (saveStates в Code.gs проверяет то же самое) ---------- */

/** Ошибка в списке состояний или null. */
export function validateStates(list: DayState[]): string | null {
  if (!list.length) return 'Нужно хотя бы одно состояние';
  const seen: Record<string, string> = {};
  for (const s of list) {
    const name = s.name.trim(), color = s.color.toLowerCase();
    if (!name) return 'У состояния нет названия';
    if (!/^#[0-9a-f]{6}$/.test(color)) return `Неверный цвет у «${name}»`;
    if (color === PLAN) return 'Голубой занят под «В планах»';
    if (color === '#ffffff') return 'Белый нельзя — он значит «пусто»';
    if (seen[color]) return `«${name}» и «${seen[color]}» одного цвета`;
    seen[color] = name;
  }
  return null;
}

/** Цвета, которые были у прежних состояний и пропали: уже отмеченные ими ячейки станут «своим цветом». */
export function droppedColors(before: DayState[], after: DayState[]): DayState[] {
  const now = new Set(after.map((s) => s.color.toLowerCase()));
  return before.filter((s) => !now.has(s.color.toLowerCase()));
}
