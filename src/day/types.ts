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
  fetched: number;
}

/** Правка в очереди. key — столбец «Лист1» в формате d.m, iso — дата для разовых дел. */
export type DayOp =
  | { id: string; kind: 'color'; iso: string; key: string; row: number; name: string; color: string; prev?: string }
  | { id: string; kind: 'comment'; iso: string; key: string; text: string }
  | { id: string; kind: 'oneoffAdd'; iso: string; oneId: string; name: string; cat: string; color: string }
  | { id: string; kind: 'oneoffColor'; iso: string; oneId: string; color: string }
  | { id: string; kind: 'oneoffDelete'; iso: string; oneId: string };

export interface ApplyResult {
  id: string;
  status: 'ok' | 'conflict' | 'error';
  error?: string;
  current?: string;
}
