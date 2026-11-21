export type OpType = 'exp' | 'inc' | 'oth';
export type Pay = 'Карта' | 'Кэш';

/** Одна операция = одна строка листа «Операции». */
export interface Op {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type: OpType;
  amount: number;
  cur: string; // ISO-код: GEL, USD…
  pay: Pay;
  cat: string; // верхняя категория
  sub: string; // остальной путь: «Ресторан › Обед»
  comment: string;
  usd?: number | null; // сумма в долларах по курсу дня (считает сервер)
  gel?: number | null; // сумма в лари по курсу дня (считает сервер)
  updated: number; // ms, время последней правки
  deleted?: boolean;
}

/** Категория — узел дерева любой глубины (список смежности, как лист «Категории»). */
export interface CatNode {
  id: string;
  name: string;
  type: OpType;
  parent: string | null;
  order: number;
  icon?: string;
  hidden?: boolean;
}

export interface Currency {
  code: string;
  sym: string;
  name: string;
}

/** Сколько лари стоит 1 единица валюты (данные Нацбанка Грузии). */
export interface Rates {
  date: string;
  gelPer: Record<string, number>;
}

export const TYPE_LABEL: Record<OpType, string> = { exp: 'Приобретение', inc: 'Доход', oth: 'Другое' };
