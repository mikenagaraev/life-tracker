import { addDays } from '../core/format';
import { SKIP, isDone, keyOf, norm, catCounts, type DayModel } from './logic';
import type { ChartCfg, ChartKind, DayData, DayState, History, HistRow, RpDay, RpItem } from './types';

/* ---------- шкала состояний ---------- */

/** Шкала уровней: индекс 0 — худшее состояние, последний — лучшее; «Перенос»/«Отмена» в неё не входят. */
export function scaleOf(states: DayState[]): DayState[] {
  return states.filter((s) => !SKIP.test(s.name)).reverse();
}

/** Состояние, ближайшее к уровню (средние уровни округляются). */
export function levelState(scale: DayState[], v: number | null | undefined): DayState | null {
  if (v === null || v === undefined || !scale.length) return null;
  return scale[Math.max(0, Math.min(scale.length - 1, Math.round(v)))];
}

export function trendWord(t: number | null): string {
  if (t === null) return '—';
  return t > 0.3 ? 'вверх ↑' : t < -0.3 ? 'вниз ↓' : 'ровно →';
}

/** «21.11.2027» → «21.11». */
export const shortKey = (k: string) => k.split('.').slice(0, 2).join('.');

/* ---------- период сводки ---------- */

export type RpPeriod = 'day' | '7' | '30' | 'custom';
export const MAX_REPORT_DAYS = 93;

export function reportRange(p: RpPeriod, iso: string, from?: string, to?: string): [string, string] {
  if (p === 'custom') {
    let a = from || addDays(iso, -6), b = to || iso;
    if (a > b) [a, b] = [b, a];
    return [a, b];
  }
  return p === 'day' ? [iso, iso] : [addDays(iso, -(Number(p) - 1)), iso];
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
}

export const reportKey = (from: string, to: string, cats: string[] | null) => `${from}|${to}|${cats?.length ? cats.join('\u0001') : '*'}`;

/** Сгруппировать по категории, сохраняя порядок первого появления. */
export function groupByCat<T extends { cat: string }>(arr: T[]): [string, T[]][] {
  const order: string[] = [];
  const m: Record<string, T[]> = {};
  for (const x of arr) {
    if (!m[x.cat]) { m[x.cat] = []; order.push(x.cat); }
    m[x.cat].push(x);
  }
  return order.map((c) => [c, m[c]]);
}

/** Что сделано за день по категориям: дела и разовые («на день»). */
export function doneByCat(d: RpDay): [string, (RpItem & { one?: boolean })[]][] {
  const all: (RpItem & { one?: boolean })[] = [
    ...d.done,
    ...d.oneoffs.filter((o) => o.done).map((o) => ({ cat: o.cat, name: o.name, color: o.color, label: o.label, level: o.level, note: '', one: true })),
  ];
  return groupByCat(all);
}

/* ---------- внимание за день ---------- */

export function attention(model: DayModel, states: DayState[]): { total: number; items: { name: string; n: number }[] } {
  const items = model.cats.map((c) => ({ name: c.name, n: catCounts(c, states).done })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  return { total: items.reduce((s, x) => s + x.n, 0), items };
}

/* ---------- история для графиков ---------- */

export interface HistModel {
  dates: string[];
  rows: (HistRow & { cat: string; colors: string[] })[];
}

export function prepareHistory(h: Pick<History, 'dates' | 'rows'>): HistModel {
  let cat = '';
  return {
    dates: h.dates,
    rows: h.rows.map((r) => {
      if (r.sphere && !r.solo) cat = r.name;
      return { ...r, cat: r.solo ? '' : cat, colors: r.c.split(',').map(norm) };
    }),
  };
}

/** Столбец выбранного дня — из приложения (с ещё не отправленными отметками), а не из истории. */
export function overlayDay(h: HistModel, day: DayData | null): HistModel {
  if (!day || !day.found) return h;
  const i = h.dates.indexOf(keyOf(day.iso));
  if (i < 0) return h;
  const byRow = new Map(day.items.map((it) => [it.row, it]));
  let changed = false;
  const rows = h.rows.map((r) => {
    const it = byRow.get(r.row);
    if (!it || it.name !== r.name || norm(it.color) === (r.colors[i] || '')) return r;
    changed = true;
    const colors = r.colors.slice();
    colors[i] = norm(it.color);
    return { ...r, colors };
  });
  return changed ? { ...h, rows } : h;
}

export interface FieldGroup { label: string; options: { value: string; label: string }[] }

export function fieldOptions(h: HistModel): FieldGroup[] {
  const base = [{ value: 'day', label: 'День' }, { value: 'all', label: 'Все дела' }];
  for (const r of h.rows) if (r.solo && r.name !== 'День' && r.name !== 'Другое') base.push({ value: `solo:${r.name}`, label: `Итоги · ${r.name}` });
  const cats = h.rows.filter((r) => r.sphere && !r.solo).map((r) => r.name);
  const groups: FieldGroup[] = [{ label: 'Общее', options: base }, { label: 'Категории', options: cats.map((c) => ({ value: `cat:${c}`, label: c })) }];
  for (const c of cats) {
    const items = h.rows.filter((r) => !r.sphere && !r.solo && r.cat === c);
    if (items.length) groups.push({ label: c, options: items.map((r) => ({ value: `task:${c}/${r.name}`, label: r.name })) });
  }
  return groups;
}

export function fieldLabel(f: string): string {
  if (f === 'day') return 'День';
  if (f === 'all') return 'Все дела';
  if (f.startsWith('solo:')) return f.slice(5);
  if (f.startsWith('cat:')) return f.slice(4);
  if (f.startsWith('task:')) return f.slice(5).split('/').slice(1).join('/');
  return f;
}

function pickRows(h: HistModel, field: string) {
  const rows = h.rows;
  if (field === 'day') return rows.filter((r) => r.name === 'День');
  if (field === 'all') return rows.filter((r) => !r.sphere && !r.solo);
  if (field.startsWith('solo:')) return rows.filter((r) => r.solo && r.name === field.slice(5));
  if (field.startsWith('cat:')) return rows.filter((r) => !r.sphere && !r.solo && r.cat === field.slice(4));
  if (field.startsWith('task:')) {
    const [c, ...n] = field.slice(5).split('/');
    const nm = n.join('/');
    const hit = rows.filter((r) => r.name === nm && r.cat === c);
    return hit.length ? hit : rows.filter((r) => r.name === nm).slice(0, 1);
  }
  return [];
}

/** Значение по дням: уровень (средний по отмеченным строкам; null — нет оценки) или число отметок. */
export function seriesFor(h: HistModel, field: string, kind: ChartKind, states: DayState[]): (number | null)[] {
  const pick = pickRows(h, field);
  const scale = scaleOf(states).map((s) => s.color);
  return h.dates.map((_, i) => {
    const cols = pick.map((r) => r.colors[i] || '').filter((c) => isDone(c, states));
    if (kind === 'count') return cols.length;
    const lv = cols.map((c) => scale.indexOf(c)).filter((v) => v >= 0);
    return lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : null;
  });
}

export function sliceChart<T>(vals: T[], dates: string[], cfg: Pick<ChartCfg, 'period'>): { vals: T[]; dates: string[] } {
  return cfg.period ? { vals: vals.slice(-cfg.period), dates: dates.slice(-cfg.period) } : { vals, dates };
}

/** Подпись под графиком: среднее и последние 7 отметок (уровень) или сумма и среднее в день (количество). */
export function chartNote(vals: (number | null)[], kind: ChartKind, scale: DayState[]): { a: string; b: string } | null {
  if (kind === 'count') {
    const nums = vals.map((v) => v || 0);
    const sum = nums.reduce((a, b) => a + b, 0);
    if (!sum) return null;
    return { a: `Всего за период: ${sum}`, b: `в среднем в день: ${(sum / nums.length).toFixed(1).replace('.', ',')}` };
  }
  const pts = vals.filter((v): v is number => v !== null);
  if (!pts.length) return null;
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return { a: `В среднем: ${levelState(scale, avg(pts))?.name}`, b: `последние 7 отметок: ${levelState(scale, avg(pts.slice(-7)))?.name}` };
}

export const DEFAULT_CHARTS: ChartCfg[] = [{ field: 'day', kind: 'level', period: 30 }];

export function cleanCharts(list: ChartCfg[]): ChartCfg[] {
  return list.slice(0, 30).map((c) => ({
    field: String(c.field || 'day').slice(0, 200),
    kind: c.kind === 'count' ? 'count' : 'level',
    period: ([7, 14, 30, 90, 0] as const).includes(c.period) ? c.period : 30,
  }));
}
