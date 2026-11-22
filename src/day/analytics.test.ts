import { describe, expect, it } from 'vitest';
import {
  attention, chartNote, cleanCharts, daysBetween, doneByCat, fieldLabel, fieldOptions, levelState, overlayDay, prepareHistory,
  reportKey, reportRange, scaleOf, seriesFor, sliceChart, trendWord,
} from './analytics';
import { buildModel } from './logic';
import type { DayData, DayItem, History, RpDay } from './types';

const STATES = [
  { name: 'Супер', color: '#ff00ff' }, { name: 'Отлично', color: '#00ff00' }, { name: 'Хорошо', color: '#ffff00' },
  { name: 'Перенос', color: '#ff9900' }, { name: 'Плохо', color: '#000000' },
];

// Работа: Дейлик, Задача; Питание: Обед; итоги: Настроение, День. Три дня: 20.11, 21.11, 22.11.
const HIST: History = {
  dates: ['20.11', '21.11', '22.11'],
  rows: [
    { row: 12, name: 'Работа', sphere: true, solo: false, c: ',,' },
    { row: 13, name: 'Дейлик', sphere: false, solo: false, c: '#ffff00,#FF00FF,' },
    { row: 14, name: 'Задача', sphere: false, solo: false, c: '#00ffff,#ff9900,#00ff00' },
    { row: 15, name: 'Питание', sphere: true, solo: false, c: ',,' },
    { row: 16, name: 'Обед', sphere: false, solo: false, c: '#000000,#ffffff,' },
    { row: 17, name: 'Настроение', sphere: false, solo: true, c: '#00ff00,,' },
    { row: 18, name: 'День', sphere: true, solo: true, c: '#ffff00,#ff00ff,' },
  ],
  charts: [],
};

describe('шкала и период', () => {
  it('шкала: худшее внизу, без «Перенос»; средний уровень округляется', () => {
    const sc = scaleOf(STATES);
    expect(sc.map((s) => s.name)).toEqual(['Плохо', 'Хорошо', 'Отлично', 'Супер']);
    expect(levelState(sc, 2.6)?.name).toBe('Супер');
    expect(levelState(sc, -1)?.name).toBe('Плохо');
    expect(levelState(sc, null)).toBeNull();
    expect(trendWord(0.5)).toBe('вверх ↑');
    expect(trendWord(-0.31)).toBe('вниз ↓');
    expect(trendWord(0.1)).toBe('ровно →');
    expect(trendWord(null)).toBe('—');
  });

  it('период сводки заканчивается выбранной датой', () => {
    expect(reportRange('day', '2026-11-22')).toEqual(['2026-11-22', '2026-11-22']);
    expect(reportRange('7', '2026-11-22')).toEqual(['2026-11-16', '2026-11-22']);
    expect(reportRange('30', '2026-03-01')).toEqual(['2026-01-31', '2026-03-01']);
    expect(reportRange('custom', '2026-11-22', '2026-11-25', '2026-11-20')).toEqual(['2026-11-20', '2026-11-25']);
    expect(daysBetween('2026-11-16', '2026-11-22')).toBe(7);
    expect(reportKey('a', 'b', null)).toBe(reportKey('a', 'b', []));
    expect(reportKey('a', 'b', ['Работа'])).not.toBe(reportKey('a', 'b', null));
  });
});

describe('графики по истории', () => {
  const h = prepareHistory(HIST);

  it('строки получают категорию, цвета — в нижнем регистре, белый = пусто', () => {
    expect(h.rows.find((r) => r.name === 'Обед')!.cat).toBe('Питание');
    expect(h.rows.find((r) => r.name === 'Дейлик')!.colors).toEqual(['#ffff00', '#ff00ff', '']);
    expect(h.rows.find((r) => r.name === 'Обед')!.colors[1]).toBe('');
    expect(h.rows.find((r) => r.name === 'Настроение')!.cat).toBe('');
  });

  it('количество: план и «Перенос» не считаются', () => {
    expect(seriesFor(h, 'all', 'count', STATES)).toEqual([2, 1, 1]);
    expect(seriesFor(h, 'cat:Работа', 'count', STATES)).toEqual([1, 1, 1]);
  });

  it('уровень: среднее по отмеченным, null — нет оценки', () => {
    // Плохо=0, Хорошо=1, Отлично=2, Супер=3
    expect(seriesFor(h, 'all', 'level', STATES)).toEqual([0.5, 3, 2]);
    expect(seriesFor(h, 'day', 'level', STATES)).toEqual([1, 3, null]);
    expect(seriesFor(h, 'solo:Настроение', 'level', STATES)).toEqual([2, null, null]);
    expect(seriesFor(h, 'task:Работа/Задача', 'level', STATES)).toEqual([null, null, 2]);
  });

  it('список полей и подписи', () => {
    const g = fieldOptions(h);
    expect(g[0].options.map((o) => o.value)).toEqual(['day', 'all', 'solo:Настроение']);
    expect(g[1].options.map((o) => o.value)).toEqual(['cat:Работа', 'cat:Питание']);
    expect(g[2]).toEqual({ label: 'Работа', options: [{ value: 'task:Работа/Дейлик', label: 'Дейлик' }, { value: 'task:Работа/Задача', label: 'Задача' }] });
    expect(fieldLabel('task:Работа/Встреча / звонок')).toBe('Встреча / звонок');
    expect(fieldLabel('cat:Питание')).toBe('Питание');
  });

  it('выбранный день берётся из приложения (неотправленные отметки видны)', () => {
    const items: DayItem[] = [
      { row: 13, name: 'Дейлик', sphere: false, color: '#00ff00', solo: false, planned: false, sub: '' },
      { row: 16, name: 'Не то дело', sphere: false, color: '#ff00ff', solo: false, planned: false, sub: '' },
    ];
    const day: DayData = { iso: '2026-11-22', found: true, items, oneoffs: [], states: STATES, comment: '', fetched: 0 };
    const o = overlayDay(h, day);
    expect(o.rows.find((r) => r.name === 'Дейлик')!.colors).toEqual(['#ffff00', '#ff00ff', '#00ff00']);
    expect(o.rows.find((r) => r.name === 'Обед')!.colors[2]).toBe(''); // строка не совпала по имени — не трогаем
    expect(overlayDay(h, { ...day, iso: '2026-12-01' })).toBe(h);
  });

  it('период графика и подпись', () => {
    const s = sliceChart([1, 2, 3, 4], ['a', 'b', 'c', 'd'], { period: 7 });
    expect(s.vals).toEqual([1, 2, 3, 4]);
    expect(sliceChart([1, 2, 3], ['a', 'b', 'c'], { period: 0 }).dates).toEqual(['a', 'b', 'c']);
    const sc = scaleOf(STATES);
    expect(chartNote([2, 0, 1], 'count', sc)).toEqual({ a: 'Всего за период: 3', b: 'в среднем в день: 1,0' });
    expect(chartNote([0, 0], 'count', sc)).toBeNull();
    expect(chartNote([3, null, 2], 'level', sc)).toEqual({ a: 'В среднем: Супер', b: 'последние 7 отметок: Супер' });
    expect(cleanCharts([{ field: '', kind: 'x' as never, period: 5 as never }])).toEqual([{ field: 'day', kind: 'level', period: 30 }]);
  });
});

describe('сводка', () => {
  it('сделанное по категориям вместе с разовыми', () => {
    const d = {
      done: [{ cat: 'Работа', name: 'Дейлик', color: '#ffff00', label: 'Хорошо', level: 1, note: '' }],
      oneoffs: [
        { name: 'Лампочки', cat: 'Дом', color: '#00ff00', label: 'Отлично', level: 2, done: true },
        { name: 'Позвонить', cat: 'Работа', color: '', label: '', level: null, done: false },
        { name: 'Отчёт', cat: 'Работа', color: '#ff00ff', label: 'Супер', level: 3, done: true },
      ],
    } as unknown as RpDay;
    const g = doneByCat(d);
    expect(g.map(([c, xs]) => [c, xs.map((x) => x.name)])).toEqual([['Работа', ['Дейлик', 'Отчёт']], ['Дом', ['Лампочки']]]);
    expect(g[0][1][1].one).toBe(true);
  });

  it('внимание за день — по категориям, по убыванию', () => {
    const mk = (row: number, name: string, color = '', sphere = false): DayItem => ({ row, name, sphere, color, solo: false, planned: false, sub: '' });
    const m = buildModel({
      items: [mk(1, 'Работа', '', true), mk(2, 'А', '#ffff00'), mk(3, 'Б', '#00ffff'), mk(4, 'Питание', '', true), mk(5, 'В', '#00ff00'), mk(6, 'Г', '#ff00ff'), mk(7, 'Спорт', '', true), mk(8, 'Д')],
      oneoffs: [],
    });
    expect(attention(m, STATES)).toEqual({ total: 3, items: [{ name: 'Питание', n: 2 }, { name: 'Работа', n: 1 }] });
  });
});
