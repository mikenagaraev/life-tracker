import { describe, expect, it } from 'vitest';
import { addPoint, parseStrokes } from './Sketch';

describe('холст', () => {
  it('битые данные не ломают рисунок', () => {
    expect(parseStrokes('')).toEqual([]);
    expect(parseStrokes('{oops')).toEqual([]);
    expect(parseStrokes('[{"c":"ink","w":3,"p":[1,2]},{"x":1}]')).toEqual([{ c: 'ink', w: 3, p: [1, 2] }]);
  });
  it('мелкие движения пальца не добавляют точек', () => {
    const p = [100, 100];
    expect(addPoint(p, 102, 102)).toBe(false);
    expect(addPoint(p, 110, 100)).toBe(true);
    expect(p).toEqual([100, 100, 110, 100]);
  });
});
