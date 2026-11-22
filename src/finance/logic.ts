import type { CatNode, Op, OpType, Rates } from './types';
import { addDays, isoOf, parseIso } from '../core/format';

/* ---------- дерево категорий ---------- */

export function children(cats: CatNode[], parent: string | null, type?: OpType, withHidden = false): CatNode[] {
  return cats
    .filter((c) => c.parent === parent && (type === undefined || c.type === type) && (withHidden || !c.hidden))
    .sort((a, b) => a.order - b.order);
}

export function byId(cats: CatNode[], id: string | null | undefined): CatNode | undefined {
  return id ? cats.find((c) => c.id === id) : undefined;
}

/** Путь от корня до узла: [корень, …, узел]. */
export function pathTo(cats: CatNode[], id: string): CatNode[] {
  const out: CatNode[] = [];
  let n = byId(cats, id);
  const seen = new Set<string>();
  while (n && !seen.has(n.id)) {
    seen.add(n.id);
    out.unshift(n);
    n = byId(cats, n.parent);
  }
  return out;
}

/** Как операция пишется в таблицу: верхняя категория + остальной путь через «›». */
export function opCategory(cats: CatNode[], id: string): { cat: string; sub: string } {
  const p = pathTo(cats, id);
  return { cat: p[0]?.name || '', sub: p.slice(1).map((n) => n.name).join(' › ') };
}

/** Обратное: найти узел по названиям из строки таблицы (для правки старой записи). */
export function findByNames(cats: CatNode[], type: OpType, cat: string, sub: string): string | null {
  const root = children(cats, null, type, true).find((c) => c.name === cat);
  if (!root) return null;
  let node: CatNode = root;
  for (const part of sub ? sub.split(' › ') : []) {
    const parentId: string = node.id;
    const next = children(cats, parentId, undefined, true).find((c) => c.name === part);
    if (!next) break;
    node = next;
  }
  return node.id;
}

export function addCat(cats: CatNode[], type: OpType, parent: string | null, name: string, id: string): CatNode[] {
  const sibs = children(cats, parent, parent ? undefined : type, true);
  const order = sibs.length ? Math.max(...sibs.map((s) => s.order)) + 1 : 0;
  return [...cats, { id, name: name.trim(), type, parent, order, icon: parent ? undefined : 'tag' }];
}

export function renameCat(cats: CatNode[], id: string, name: string): CatNode[] {
  return cats.map((c) => (c.id === id ? { ...c, name: name.trim() } : c));
}

export function toggleHidden(cats: CatNode[], id: string): CatNode[] {
  return cats.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c));
}

/** Сдвинуть узел вверх/вниз среди братьев. */
export function moveCat(cats: CatNode[], id: string, dir: -1 | 1): CatNode[] {
  const node = byId(cats, id);
  if (!node) return cats;
  const sibs = children(cats, node.parent, node.parent ? undefined : node.type, true);
  const i = sibs.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return cats;
  const order = new Map<string, number>();
  const swapped = [...sibs];
  [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
  swapped.forEach((s, k) => order.set(s.id, k));
  return cats.map((c) => (order.has(c.id) ? { ...c, order: order.get(c.id)! } : c));
}

/** Имя занято среди братьев? */
export function nameTaken(cats: CatNode[], type: OpType, parent: string | null, name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase();
  return children(cats, parent, parent ? undefined : type, true).some((c) => c.id !== exceptId && c.name.toLowerCase() === n);
}

/* ---------- валюты ---------- */

/** Перевести сумму в USD или GEL. Сначала — значение сервера (курс дня операции), иначе — по последнему известному курсу. */
export function valueIn(op: Op, target: 'USD' | 'GEL', rates: Rates | null): number | null {
  const server = target === 'USD' ? op.usd : op.gel;
  if (typeof server === 'number' && Number.isFinite(server)) return server;
  if (op.cur === target) return op.amount;
  if (!rates) return null;
  const from = op.cur === 'GEL' ? 1 : rates.gelPer[op.cur];
  const to = target === 'GEL' ? 1 : rates.gelPer[target];
  if (!from || !to) return null;
  return (op.amount * from) / to;
}

export function convert(amount: number, from: string, to: string, rates: Rates | null): number | null {
  if (from === to) return amount;
  if (!rates) return null;
  const a = from === 'GEL' ? 1 : rates.gelPer[from];
  const b = to === 'GEL' ? 1 : rates.gelPer[to];
  if (!a || !b) return null;
  return (amount * a) / b;
}

/* ---------- синхронизация ---------- */

/** Данные сервера + то, что ещё не отправлено (оно новее). Удалённые локально прячем. */
export function mergeOps(server: Op[], pending: Record<string, Op>): Record<string, Op> {
  const out: Record<string, Op> = {};
  for (const op of server) out[op.id] = op;
  for (const op of Object.values(pending)) {
    if (op.deleted) delete out[op.id];
    else out[op.id] = { ...out[op.id], ...op };
  }
  return out;
}

/** После ответа сервера убираем из очереди только то, что не правили, пока шла отправка. */
export function ackPending(pending: Record<string, Op>, sent: Op[], applied: string[]): Record<string, Op> {
  const ok = new Set(applied);
  const out = { ...pending };
  for (const s of sent) {
    if (ok.has(s.id) && out[s.id] && out[s.id].updated === s.updated) delete out[s.id];
  }
  return out;
}

export function sortOps(ops: Op[]): Op[] {
  return [...ops].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.time < b.time ? 1 : a.time > b.time ? -1 : b.updated - a.updated));
}

/* ---------- статистика ---------- */

export type Period = 'week' | 'month' | 'year';

export interface Range {
  from: string;
  to: string;
}

/** Границы периода, в который попадает anchor (неделя — с понедельника). */
export function periodRange(period: Period, anchor: string): Range {
  const d = parseIso(anchor);
  if (period === 'week') {
    const shift = (d.getDay() + 6) % 7;
    const from = addDays(anchor, -shift);
    return { from, to: addDays(from, 6) };
  }
  if (period === 'month') {
    return { from: isoOf(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

export function shiftAnchor(period: Period, anchor: string, dir: -1 | 1): string {
  const d = parseIso(anchor);
  if (period === 'week') return addDays(anchor, 7 * dir);
  if (period === 'month') return isoOf(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  return isoOf(new Date(d.getFullYear() + dir, 0, 1));
}

export interface Bucket {
  label: string;
  value: number;
  sub?: Bucket[];
}

export interface Stats {
  income: number;
  expense: number;
  other: number;
  unknown: number; // записи без курса — не попали в суммы
  bars: { key: string; label: string; value: number }[];
  expByCat: Bucket[];
  incByCat: Bucket[];
}

function bucketize(ops: Op[], val: (op: Op) => number): Bucket[] {
  const m = new Map<string, { value: number; sub: Map<string, number> }>();
  for (const op of ops) {
    const v = val(op);
    const b = m.get(op.cat) || { value: 0, sub: new Map() };
    b.value += v;
    const first = op.sub ? op.sub.split(' › ')[0] : '';
    if (first) b.sub.set(first, (b.sub.get(first) || 0) + v);
    m.set(op.cat, b);
  }
  return [...m.entries()]
    .map(([label, b]) => ({
      label,
      value: b.value,
      sub: [...b.sub.entries()].map(([l, v]) => ({ label: l, value: v })).sort((x, y) => y.value - x.value),
    }))
    .sort((a, b) => b.value - a.value);
}

export function computeStats(all: Op[], period: Period, range: Range, target: 'USD' | 'GEL', rates: Rates | null): Stats {
  const ops = all.filter((o) => !o.deleted && o.date >= range.from && o.date <= range.to);
  let unknown = 0;
  const val = (op: Op) => {
    const v = valueIn(op, target, rates);
    if (v === null) {
      unknown++;
      return 0;
    }
    return v;
  };
  const exp = ops.filter((o) => o.type === 'exp');
  const inc = ops.filter((o) => o.type === 'inc');
  const oth = ops.filter((o) => o.type === 'oth');
  const expVals = new Map(exp.map((o) => [o.id, val(o)]));
  const incVals = new Map(inc.map((o) => [o.id, val(o)]));
  const othSum = oth.reduce((s, o) => s + val(o), 0);

  const bars: Stats['bars'] = [];
  if (period === 'year') {
    for (let m = 0; m < 12; m++) {
      const key = `${range.from.slice(0, 4)}-${String(m + 1).padStart(2, '0')}`;
      bars.push({ key, label: String(m + 1), value: exp.filter((o) => o.date.startsWith(key)).reduce((s, o) => s + expVals.get(o.id)!, 0) });
    }
  } else {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      bars.push({ key: d, label: String(Number(d.slice(8))), value: exp.filter((o) => o.date === d).reduce((s, o) => s + expVals.get(o.id)!, 0) });
    }
  }
  return {
    income: [...incVals.values()].reduce((a, b) => a + b, 0),
    expense: [...expVals.values()].reduce((a, b) => a + b, 0),
    other: othSum,
    unknown,
    bars,
    expByCat: bucketize(exp, (o) => expVals.get(o.id)!),
    incByCat: bucketize(inc, (o) => incVals.get(o.id)!),
  };
}

/** Итог дня по валютам: «−32,5 ₾ · +150 $». */
export function dayTotals(ops: Op[]): { cur: string; exp: number; inc: number }[] {
  const m = new Map<string, { exp: number; inc: number }>();
  for (const o of ops) {
    if (o.type === 'oth') continue;
    const t = m.get(o.cur) || { exp: 0, inc: 0 };
    if (o.type === 'exp') t.exp += o.amount;
    else t.inc += o.amount;
    m.set(o.cur, t);
  }
  return [...m.entries()].map(([cur, t]) => ({ cur, ...t }));
}

/* ---------- бюджеты: месячный лимит на верхнюю категорию приобретений ---------- */

export type Budgets = Record<string, number>; // название верхней категории → лимит в месяц

export interface BudgetLine {
  cat: string;
  limit: number;
  spent: number;
  left: number;
  pct: number; // 0..∞, доля потраченного
  state: 'ok' | 'warn' | 'over';
}

/**
 * Сколько потрачено по каждой категории с бюджетом в месяце range (в валюте бюджета).
 * pace — какая доля месяца прошла (для текущего месяца): «warn», если тратим заметно быстрее.
 */
export function budgetStatus(all: Op[], range: Range, budgets: Budgets, cur: 'USD' | 'GEL', rates: Rates | null, pace = 1): { lines: BudgetLine[]; limit: number; spent: number } {
  const spentBy = new Map<string, number>();
  for (const o of all) {
    if (o.deleted || o.type !== 'exp' || o.date < range.from || o.date > range.to || !(o.cat in budgets)) continue;
    spentBy.set(o.cat, (spentBy.get(o.cat) || 0) + (valueIn(o, cur, rates) || 0));
  }
  const lines = Object.entries(budgets).filter(([, l]) => l > 0).map(([cat, limit]): BudgetLine => {
    const spent = spentBy.get(cat) || 0, pct = spent / limit;
    return { cat, limit, spent, left: limit - spent, pct, state: pct > 1 ? 'over' : pct >= 0.9 || pct > pace + 0.15 ? 'warn' : 'ok' };
  }).sort((a, b) => b.pct - a.pct);
  return { lines, limit: lines.reduce((s, l) => s + l.limit, 0), spent: lines.reduce((s, l) => s + l.spent, 0) };
}

/** Доля прошедшего месяца на дату today (для прошлых месяцев — 1, для будущих — 0). */
export function monthPace(range: Range, today: string): number {
  if (today > range.to) return 1;
  if (today < range.from) return 0;
  const days = Number(range.to.slice(8));
  return Number(today.slice(8)) / days;
}
