import { describe, expect, it } from 'vitest';
import { dropIndex, moveItem } from './reorder';

describe('перетаскивание', () => {
  const mids = [25, 75, 125, 175]; // строки по 50 px
  it('новое место по центру строки', () => {
    expect(dropIndex(mids, 0, 25)).toBe(0); // не двигали
    expect(dropIndex(mids, 0, 80)).toBe(1); // чуть ниже второй
    expect(dropIndex(mids, 0, 400)).toBe(3); // в самый низ
    expect(dropIndex(mids, 3, 10)).toBe(0); // в самый верх
    expect(dropIndex(mids, 2, 100)).toBe(2); // между второй и четвёртой — на месте
    expect(dropIndex(mids, 2, 60)).toBe(1); // выше середины второй
  });
  it('перестановка', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });
});
