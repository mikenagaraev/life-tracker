/** Строка «Лист1»: заголовок категории (sphere), дело или строка «Итогов дня» (solo). */
export interface DayItem {
  row: number;
  name: string;
  sphere: boolean;
  color: string; // '#rrggbb' в нижнем регистре; '' или '#ffffff' — не отмечено
  solo: boolean;
  planned: boolean;
  sub: string; // подкатегория (столбец C)
}

export interface OneOff {
  id: string;
  name: string;
  color: string;
  cat: string;
}

export interface DayState {
  name: string;
  color: string;
}

export interface DayData {
  iso: string;
  found: boolean;
  items: DayItem[];
  oneoffs: OneOff[];
  states: DayState[];
  comment: string;
  drawings?: Drawings; // нет у дней, сохранённых до версии с рисунками
  fetched: number;
}

/** Рисунки дня: JSON-массив линий {c: цвет | 'ink', w: толщина, p: [x, y, …] в долях 0–1000}; '' — нет рисунка. */
export interface Drawings { amp: string; pic: string }
export type DrawType = keyof Drawings;
export interface Stroke { c: string; w: number; p: number[] }

/** Правка в очереди. key — столбец «Лист1» в формате d.m, iso — дата для разовых дел. */
export type DayOp =
  | { id: string; kind: 'color'; iso: string; key: string; row: number; name: string; color: string; prev?: string }
  | { id: string; kind: 'comment'; iso: string; key: string; text: string }
  | { id: string; kind: 'oneoffAdd'; iso: string; oneId: string; name: string; cat: string; color: string }
  | { id: string; kind: 'oneoffColor'; iso: string; oneId: string; color: string }
  | { id: string; kind: 'oneoffDelete'; iso: string; oneId: string }
  | { id: string; kind: 'drawing'; iso: string; dtype: DrawType; data: string };

export interface ApplyResult {
  id: string;
  status: 'ok' | 'conflict' | 'error';
  error?: string;
  current?: string;
}

/* ---------- сводка (getReport в Code.gs) ---------- */

/** level — индекс в шкале состояний: 0 — худшее, N−1 — лучшее; null — не оценено. */
export interface RpItem { cat: string; name: string; color: string; label: string; level: number | null; note: string }
export interface RpOneOff { name: string; cat: string; color: string; label: string; level: number | null; done: boolean }
export interface RpSummary { name: string; color: string; label: string; level: number | null; note: string }
export interface RpDay {
  iso: string;
  key: string;
  found: boolean;
  done: RpItem[];
  planned: { cat: string; name: string }[];
  summary: RpSummary[];
  notes: { cat: string; name: string; note: string }[];
  oneoffs: RpOneOff[];
  comment: string;
  drawings: { amp: string; pic: string }; // без запроса рисунков — '1', если рисунок есть
  level: number | null;
  dayColor: string;
  mood: number | null;
  count: number;
}
export interface RpMark { name: string; label: string; color: string }
export interface Insights {
  daysTotal: number;
  daysLive: number;
  total: number;
  perDay: number;
  avgLevel: number | null;
  levelDays: number;
  trend: number | null;
  best: string;
  worst: string;
  top: { name: string; cat: string; count: number; avg: number | null; mood: number | null; moodN: number }[];
  moodName: string;
  moodAvg: number | null;
  moodDays: number;
  cats: { name: string; count: number }[];
  bright: { iso: string; key: string; level: number | null; comment: string; highlights: RpMark[]; score: number }[];
  lowDays: { iso: string; key: string; level: number; comment: string; low: RpMark[] }[];
  drops: { from: string; to: string; a: number; b: number }[];
  lowItems: { name: string; cat: string; count: number; labels: string }[];
  missed: { name: string; cat: string; count: number }[];
  neglected: string[];
}
export interface Report {
  from: string;
  to: string;
  states: DayState[]; // без «Перенос»/«Отмена»
  days: RpDay[];
  filter: string[] | null;
  insights: Insights;
}

/* ---------- графики (getHistory + настройка charts) ---------- */

export type ChartKind = 'level' | 'count';
export type ChartPeriod = 7 | 14 | 30 | 90 | 0;
export interface ChartCfg { field: string; kind: ChartKind; period: ChartPeriod }
export interface HistRow { row: number; name: string; sphere: boolean; solo: boolean; c: string }
export interface History { dates: string[]; rows: HistRow[]; charts: ChartCfg[] }
