import { describe, expect, it } from 'vitest';
import { applyOps, buildModel, categoryMoveTarget, compactOps, droppedColors, isDone, itemMoveTarget, keyOf, progress, stateOf, validateStates } from './logic';
import type { DayData, DayItem, DayOp } from './types';

const STATES = [
  { name: 'Супер', color: '#ff00ff' }, { name: 'Отлично', color: '#00ff00' }, { name: 'Хорошо', color: '#ffff00' },
  { name: 'Перенос', color: '#ff9900' }, { name: 'Отмена', color: '#b7b7b7' },
];
let row = 12;
const mk = (name: string, p: Partial<DayItem> = {}): DayItem => ({ row: row++, name, sphere: false, color: '', solo: false, planned: false, sub: '', ...p });
row = 12;
const ITEMS: DayItem[] = [
   mk('Работа', { sphere: true }),  mk('Посетить дейлик', { color: '#ffff00' }),  mk('Сделать задачу', { color: '#00ffff', planned: true }),  mk('Другое'),
   mk('Питание', { sphere: true }),  mk('Кофе', { color: '#ff9900' }),  mk('Обед', { color: '#ffffff' }),  mk('Другое'),
   mk('Удовольствие', { sphere: true, solo: true, color: '#00ff00' }),  mk('Другое', { solo: true }),  mk('Настроение', { solo: true }),  mk('День', { sphere: true, solo: true }),
];
const DAY: DayData = {
  iso: '2026-11-21', found: true, items: ITEMS, states: STATES, comment: '', fetched: 1,
  oneoffs: [{ id: 'o1', name: 'Купить лампочки', color: '#00ff00', cat: 'Работа' }, { id: 'o2', name: 'Позвонить', color: '#00ffff', cat: 'Неизвестно' }],
};

describe('трекер дня', () => {
  it('ключ столбца без ведущих нулей', () => {
    expect(keyOf('2026-11-21')).toBe('21.11');
    expect(keyOf('2026-03-05')).toBe('5.3');
    expect(keyOf('2027-01-01')).toBe('1.1.2027');
    expect(keyOf('2025-12-31')).toBe('31.12.2025');
  });

  it('отмечено: не план, не белый, не перенос/отмена; свой цвет — отметка', () => {
    expect(isDone('#ffff00', STATES)).toBe(true);
    expect(isDone('#00ffff', STATES)).toBe(false);
    expect(isDone('#ffffff', STATES)).toBe(false);
    expect(isDone('', STATES)).toBe(false);
    expect(isDone('#ff9900', STATES)).toBe(false);
    expect(isDone('#123456', STATES)).toBe(true);
    expect(stateOf('#123456', STATES)?.name).toBe('Свой цвет');
    expect(stateOf('#00ffff', STATES)?.name).toBe('В планах');
  });

  it('раскладывает строки по категориям и итогам дня', () => {
    const m = buildModel(DAY);
    expect(m.cats.map((c) => c.name)).toEqual(['Работа', 'Питание']);
    expect(m.cats[0].items.map((i) => i.name)).toEqual(['Посетить дейлик', 'Сделать задачу', 'Другое']);
    expect(m.cats[0].oneoffs.map((o) => o.id)).toEqual(['o1']);
    expect(m.looseOneoffs.map((o) => o.id)).toEqual(['o2']);
    expect(m.solos.map((s) => s.name)).toEqual(['Удовольствие', 'Настроение', 'День']);
  });

  it('считает прогресс по делам и разовым', () => {
    expect(progress(buildModel(DAY), STATES)).toEqual({ done: 2, total: 8 });
  });

  it('правки из очереди видны сразу', () => {
    const ops: DayOp[] = [
      { id: '1', kind: 'color', iso: DAY.iso, key: '21.11', row: 14, name: 'Сделать задачу', color: '#ff00ff', prev: '#00ffff' },
      { id: '2', kind: 'comment', iso: DAY.iso, key: '21.11', text: 'Хороший день' },
      { id: '3', kind: 'oneoffAdd', iso: DAY.iso, oneId: 'o3', name: 'Новое', cat: 'Питание', color: '#00ffff' },
      { id: '4', kind: 'oneoffDelete', iso: DAY.iso, oneId: 'o2' },
      { id: '5', kind: 'color', iso: '2026-11-20', key: '20.11', row: 13, name: 'Посетить дейлик', color: '' },
    ];
    const d = applyOps(DAY, ops);
    expect(d.items.find((i) => i.row === 14)!.color).toBe('#ff00ff');
    expect(d.items.find((i) => i.row === 13)!.color).toBe('#ffff00');
    expect(d.comment).toBe('Хороший день');
    expect(d.oneoffs.map((o) => o.id)).toEqual(['o1', 'o3']);
    expect(applyOps(DAY, [])).toBe(DAY);
  });

  it('сжимает очередь', () => {
    const c = (id: string, color: string, prev?: string): DayOp => ({ id, kind: 'color', iso: DAY.iso, key: '21.11', row: 13, name: 'Посетить дейлик', color, prev });
    // две отметки подряд → одна, «было» — от первой
    expect(compactOps([c('a', '#00ff00', '#ffff00'), c('b', '#ff00ff', '#00ff00')])).toEqual([c('b', '#ff00ff', '#ffff00')]);
    // отметили и вернули как было → ничего не отправляем
    expect(compactOps([c('a', '#00ff00', '#ffff00'), c('b', '#ffff00', '#00ff00')])).toEqual([]);
    // комментарий — только последний
    const cm = (id: string, text: string): DayOp => ({ id, kind: 'comment', iso: DAY.iso, key: '21.11', text });
    expect(compactOps([cm('a', 'Раз'), cm('b', 'Два')])).toEqual([cm('b', 'Два')]);
    // разовое создали, покрасили и удалили без сети → пусто
    expect(compactOps([
      { id: 'a', kind: 'oneoffAdd', iso: DAY.iso, oneId: 'x', name: 'Тест', cat: 'Работа', color: '#00ffff' },
      { id: 'b', kind: 'oneoffColor', iso: DAY.iso, oneId: 'x', color: '#00ff00' },
      { id: 'c', kind: 'oneoffDelete', iso: DAY.iso, oneId: 'x' },
    ])).toEqual([]);
    // цвет нового разового попадает прямо в создание
    const out = compactOps([
      { id: 'a', kind: 'oneoffAdd', iso: DAY.iso, oneId: 'x', name: 'Тест', cat: 'Работа', color: '#00ffff' },
      { id: 'b', kind: 'oneoffColor', iso: DAY.iso, oneId: 'x', color: '#00ff00' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'oneoffAdd', color: '#00ff00' });
  });
});

describe('перемещения дел и категорий', () => {
  const m = buildModel(DAY);
  it('дело вверх/вниз внутри категории', () => {
    const work = m.cats[0]; // строки 13, 14, 15
    expect(itemMoveTarget(work, 0, -1)).toBeNull();
    expect(itemMoveTarget(work, 1, -1)).toBe(13);
    expect(itemMoveTarget(work, 0, 1)).toBe(15);
    expect(itemMoveTarget(work, 2, 1)).toBeNull();
  });
  it('категория вверх/вниз', () => {
    expect(categoryMoveTarget(m, 0, -1)).toBeNull();
    expect(categoryMoveTarget(m, 1, -1)).toBe(12);
    expect(categoryMoveTarget(m, 0, 1)).toBe(20); // перед итогами дня («Удовольствие»)
    expect(categoryMoveTarget(m, 1, 1)).toBeNull();
  });
});

describe('редактор состояний', () => {
  it('проверки — как у сервера', () => {
    expect(validateStates(STATES)).toBeNull();
    expect(validateStates([])).toBe('Нужно хотя бы одно состояние');
    expect(validateStates([{ name: '  ', color: '#123456' }])).toBe('У состояния нет названия');
    expect(validateStates([{ name: 'А', color: '#00FFFF' }])).toMatch(/Голубой/);
    expect(validateStates([{ name: 'А', color: '#ffffff' }])).toMatch(/Белый/);
    expect(validateStates([{ name: 'А', color: 'red' }])).toMatch(/Неверный цвет/);
    expect(validateStates([{ name: 'А', color: '#111111' }, { name: 'Б', color: '#111111' }])).toBe('«Б» и «А» одного цвета');
  });
  it('пропавшие цвета', () => {
    const after = [{ name: 'Супер!', color: '#FF00FF' }, ...STATES.slice(1, 3)];
    expect(droppedColors(STATES, after).map((s) => s.name)).toEqual(['Перенос', 'Отмена']);
  });
});
