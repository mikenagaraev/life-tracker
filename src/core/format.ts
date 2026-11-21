const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export const pad = (n: number) => String(n).padStart(2, '0');

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return isoOf(new Date());
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** «Сегодня, 21 ноября» / «Вчера, 20 ноября» / «19 ноября» / «19 ноября 2025». */
export function dayLabel(iso: string, today = todayIso()): string {
  const d = parseIso(iso);
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (iso === today) return `Сегодня, ${base}`;
  if (iso === addDays(today, -1)) return `Вчера, ${base}`;
  if (d.getFullYear() !== parseIso(today).getFullYear()) return `${base} ${d.getFullYear()}`;
  return `${base}, ${WEEKDAYS[d.getDay()]}`;
}

export const monthName = (m: number) => MONTHS[m];
export const monthShort = (m: number) => MONTHS_SHORT[m];
export const monthGen = (m: number) => MONTHS_GEN[m];

/** Число по-русски: 1 234,5 (без лишних нулей). */
export function num(v: number, maxFrac = 2): string {
  const s = Math.abs(v).toFixed(maxFrac).replace(/\.?0+$/, '');
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '−' : '') + grouped + (frac ? ',' + frac : '');
}

/** Разбор суммы из поля ввода: «1 234,50» → 1234.5. */
export function parseAmount(s: string): number {
  const v = Number(String(s).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

export function uid(prefix = 'f'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return prefix + Date.now().toString(36) + rnd;
}
