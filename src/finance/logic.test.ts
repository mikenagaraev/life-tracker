import { describe, expect, it } from 'vitest';
import { DEFAULT_CATS } from './data';
import {
  ackPending, addCat, children, computeStats, convert, dayTotals, findByNames, mergeOps, moveCat, nameTaken,
  opCategory, periodRange, shiftAnchor, valueIn,
} from './logic';
import type { Op, Rates } from './types';
import { dayLabel, num, parseAmount } from '../core/format';

const rates: Rates = { date: '2026-11-21', gelPer: { USD: 2.7, EUR: 3.0 } };
const op = (p: Partial<Op>): Op => ({
  id: 'x', date: '2026-11-21', time: '12:00', type: 'exp', amount: 10, cur: 'GEL', pay: 'Карта',
  cat: 'Еда', sub: '', comment: '', updated: 1, ...p,
});

describe('категории', () => {
  it('путь пишется как «Категория» + «Ресторан › Обед»', () => {
    expect(opCategory(DEFAULT_CATS, 'exp-food-2-0')).toEqual({ cat: 'Еда', sub: 'Ресторан › Обед' });
    expect(opCategory(DEFAULT_CATS, 'exp-gift')).toEqual({ cat: 'Подарки', sub: '' });
  });
  it('находит узел по названиям из таблицы', () => {
    expect(findByNames(DEFAULT_CATS, 'exp', 'Еда', 'Ресторан › Обед')).toBe('exp-food-2-0');
    expect(findByNames(DEFAULT_CATS, 'exp', 'Еда', 'Нет такого')).toBe('exp-food');
    expect(findByNames(DEFAULT_CATS, 'inc', 'Еда', '')).toBeNull();
  });
  it('зарплата — первая в доходах', () => {
    expect(children(DEFAULT_CATS, null, 'inc')[0].name).toBe('Зарплата');
  });
  it('добавляет подкатегорию любого уровня в конец', () => {
    const next = addCat(DEFAULT_CATS, 'exp', 'exp-food-2-0', 'Грузинская кухня', 'n1');
    expect(children(next, 'exp-food-2-0').map((c) => c.name)).toEqual(['Грузинская кухня']);
    expect(opCategory(next, 'n1').sub).toBe('Ресторан › Обед › Грузинская кухня');
  });
  it('двигает среди братьев и не выходит за край', () => {
    const up = moveCat(DEFAULT_CATS, 'exp-transport', -1);
    expect(children(up, null, 'exp').slice(0, 2).map((c) => c.name)).toEqual(['Транспорт', 'Еда']);
    expect(moveCat(DEFAULT_CATS, 'exp-food', -1)).toBe(DEFAULT_CATS);
  });
  it('видит занятое имя без учёта регистра', () => {
    expect(nameTaken(DEFAULT_CATS, 'exp', null, 'еда')).toBe(true);
    expect(nameTaken(DEFAULT_CATS, 'inc', null, 'еда')).toBe(false);
  });
});

describe('валюты', () => {
  it('берёт сумму сервера, иначе считает по курсу', () => {
    expect(valueIn(op({ usd: 3.7 }), 'USD', rates)).toBe(3.7);
    expect(valueIn(op({ amount: 27 }), 'USD', rates)).toBeCloseTo(10);
    expect(valueIn(op({ cur: 'USD', amount: 5 }), 'USD', null)).toBe(5);
    expect(valueIn(op({ cur: 'EUR' }), 'GEL', rates)).toBeCloseTo(30);
    expect(valueIn(op({ cur: 'XXX' }), 'USD', rates)).toBeNull();
    expect(valueIn(op({}), 'USD', null)).toBeNull();
  });
  it('convert', () => {
    expect(convert(10, 'USD', 'GEL', rates)).toBeCloseTo(27);
    expect(convert(10, 'GEL', 'GEL', null)).toBe(10);
  });
});

describe('очередь', () => {
  it('локальные правки поверх сервера, удалённое скрыто', () => {
    const server = [op({ id: 'a', amount: 1 }), op({ id: 'b' })];
    const merged = mergeOps(server, { a: op({ id: 'a', amount: 2 }), b: op({ id: 'b', deleted: true }), c: op({ id: 'c' }) });
    expect(Object.keys(merged).sort()).toEqual(['a', 'c']);
    expect(merged.a.amount).toBe(2);
  });
  it('не теряет правку, сделанную во время отправки', () => {
    const sent = [op({ id: 'a', updated: 1 }), op({ id: 'b', updated: 1 })];
    const now = { a: op({ id: 'a', updated: 1 }), b: op({ id: 'b', updated: 2 }) };
    expect(Object.keys(ackPending(now, sent, ['a', 'b']))).toEqual(['b']);
    expect(Object.keys(ackPending(now, sent, []))).toEqual(['a', 'b']);
  });
});

describe('статистика', () => {
  it('границы периодов', () => {
    expect(periodRange('week', '2026-11-21')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('year', '2026-06-01')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(shiftAnchor('month', '2026-01-31', -1)).toBe('2025-12-01');
  });
  it('суммы, категории, «Другое» отдельно', () => {
    const ops = [
      op({ id: '1', usd: 10, cat: 'Еда', sub: 'Ресторан › Обед' }),
      op({ id: '2', usd: 5, cat: 'Еда', sub: 'Магазин' }),
      op({ id: '3', usd: 100, type: 'inc', cat: 'Зарплата' }),
      op({ id: '4', usd: 50, type: 'oth', cat: 'Обмен валюты' }),
      op({ id: '5', usd: 7, date: '2026-10-31' }),
      op({ id: '6', cur: 'XXX' }),
    ];
    const s = computeStats(ops, 'month', periodRange('month', '2026-11-21'), 'USD', rates);
    expect(s.expense).toBe(15);
    expect(s.income).toBe(100);
    expect(s.other).toBe(50);
    expect(s.unknown).toBe(1);
    expect(s.expByCat[0]).toMatchObject({ label: 'Еда', value: 15 });
    expect(s.expByCat[0].sub!.map((b) => b.label)).toEqual(['Ресторан', 'Магазин']);
    expect(s.bars).toHaveLength(30);
    expect(s.bars[20].value).toBe(15);
  });
  it('итог дня по валютам', () => {
    expect(dayTotals([op({ amount: 24.5 }), op({ amount: 8 }), op({ type: 'inc', cur: 'USD', amount: 150 })])).toEqual([
      { cur: 'GEL', exp: 32.5, inc: 0 },
      { cur: 'USD', exp: 0, inc: 150 },
    ]);
  });
});

describe('формат', () => {
  it('числа и суммы', () => {
    expect(num(1234.5)).toBe('1 234,5');
    expect(num(24)).toBe('24');
    expect(num(0, 0)).toBe('0');
    expect(num(0)).toBe('0');
    expect(num(100, 0)).toBe('100');
    expect(num(10.5)).toBe('10,5');
    expect(num(-3.25)).toBe('−3,25');
    expect(parseAmount('1 234,50')).toBe(1234.5);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
  });
  it('подписи дней', () => {
    expect(dayLabel('2026-11-21', '2026-11-21')).toBe('Сегодня, 21 ноября');
    expect(dayLabel('2026-11-20', '2026-11-21')).toBe('Вчера, 20 ноября');
    expect(dayLabel('2025-11-19', '2026-11-21')).toBe('19 ноября 2025');
  });
});
