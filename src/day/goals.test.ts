import { describe, expect, it } from 'vitest';
import {
  applyGoalOps, cmpNum, compactGoalOps, dueInfo, goalId, kids, moved, nextSteps, numbers, pathTo, scopeOf, stats, subtree, topTags, upcoming,
  type Goal, type GoalOp,
} from './goals';

const g = (id: string, parent: string, order: number, p: Partial<Goal> = {}): Goal =>
  ({ id, parent, title: id, done: p.status === 'done', order, tag: '', status: 'todo', due: '', ...p });

// 1 Альбом (#Музыка, до 2027-08-01): 1.1 Записать ✓, 1.2 Сведение (в процессе) → 1.2.1 Мастеринг, 1.3 Обложка (до 2026-12-01)
// 2 Работа (#Работа): 2.1 Курс (до 2026-11-20)
const G: Goal[] = [
  g('album', '', 1, { tag: 'Музыка', status: 'doing', due: '2027-08-01' }),
  g('rec', 'album', 1, { status: 'done' }),
  g('mix', 'album', 2, { status: 'doing' }),
  g('master', 'mix', 1),
  g('cover', 'album', 3, { due: '2026-12-01' }),
  g('work', '', 2, { tag: 'Работа' }),
  g('course', 'work', 1, { due: '2026-11-20' }),
];

describe('дерево целей', () => {
  it('номера, порядок, прогресс, путь', () => {
    const n = numbers(G);
    expect([n.album, n.mix, n.master, n.cover, n.course]).toEqual(['1', '1.2', '1.2.1', '1.3', '2.1']);
    expect(kids(G, 'album').map((x) => x.id)).toEqual(['rec', 'mix', 'cover']);
    expect(stats(G, 'album')).toEqual({ n: 4, k: 1 });
    expect(pathTo(G, 'master').map((x) => x.id)).toEqual(['album', 'mix', 'master']);
    expect([...subtree(G, 'mix')].sort()).toEqual(['master', 'mix']);
    expect(['1.10', '1.2', '2', '1.2.1'].sort(cmpNum)).toEqual(['1.2', '1.2.1', '1.10', '2']);
  });

  it('теги, фильтр, ближайшие сроки', () => {
    expect(topTags(G)).toEqual(['Музыка', 'Работа']);
    expect([...scopeOf(G, 'Работа')].sort()).toEqual(['course', 'work']);
    expect(scopeOf(G, '').size).toBe(7);
    expect(upcoming(G, scopeOf(G, '')).map((x) => x.id)).toEqual(['course', 'cover', 'album']);
  });

  it('что сделать дальше: листья без открытых подзадач, «в процессе» и срок — раньше', () => {
    expect(nextSteps(G, 'album').map((x) => x.id)).toEqual(['cover', 'master']);
    const doing = G.map((x) => (x.id === 'master' ? { ...x, status: 'doing' as const } : x));
    expect(nextSteps(doing, 'album').map((x) => x.id)).toEqual(['master', 'cover']);
  });

  it('срок: просрочено / сегодня / готово', () => {
    expect(dueInfo({ due: '2026-11-20', status: 'todo' }, '2026-11-22')?.kind).toBe('late');
    expect(dueInfo({ due: '2026-11-22', status: 'doing' }, '2026-11-22')?.kind).toBe('today');
    expect(dueInfo({ due: '2026-11-20', status: 'done' }, '2026-11-22')?.kind).toBe('fin');
    expect(dueInfo({ due: '', status: 'todo' }, '2026-11-22')).toBeNull();
  });

  it('сдвиг среди соседей', () => {
    expect(moved(G, 'cover', -1)).toEqual({ parent: 'album', ids: ['rec', 'cover', 'mix'] });
    expect(moved(G, 'rec', -1)).toBeNull();
    expect(moved(G, 'work', 1)).toBeNull();
  });

  it('id как у сервера', () => {
    expect(goalId()).toMatch(/^g[0-9a-f]{10}$/);
  });
});

describe('очередь правок целей', () => {
  const op = (o: Omit<GoalOp, 'id'> & Record<string, unknown>, id = Math.random().toString(36)): GoalOp => ({ ...o, id }) as GoalOp;

  it('правки видны сразу', () => {
    const v = applyGoalOps(G, [
      op({ kind: 'add', gid: 'gnew', parent: 'work', title: 'Сдать экзамен', tag: '', due: '' }),
      op({ kind: 'status', gid: 'course', status: 'done' }),
      op({ kind: 'order', parent: 'work', ids: ['gnew', 'course'] }),
      op({ kind: 'delete', gid: 'mix', ids: ['mix', 'master'] }),
    ]);
    expect(kids(v, 'work').map((x) => x.id)).toEqual(['gnew', 'course']);
    expect(v.find((x) => x.id === 'course')!.done).toBe(true);
    expect(v.some((x) => x.id === 'master')).toBe(false);
    expect(applyGoalOps(G, [])).toBe(G);
  });

  it('новая цель: правки вливаются в создание, удаление до отправки — ничего не шлём', () => {
    const q = compactGoalOps([
      op({ kind: 'add', gid: 'gnew', parent: '', title: 'Черновик', tag: '', due: '' }, 'a'),
      op({ kind: 'rename', gid: 'gnew', title: 'Испания' }),
      op({ kind: 'tag', gid: 'gnew', tag: 'Жизнь' }),
      op({ kind: 'due', gid: 'gnew', due: '2027-06-01' }),
    ]);
    expect(q).toEqual([{ id: 'a', kind: 'add', gid: 'gnew', parent: '', title: 'Испания', tag: 'Жизнь', due: '2027-06-01' }]);
    const gone = compactGoalOps([
      ...q,
      op({ kind: 'add', gid: 'gsub', parent: 'gnew', title: 'Виза', tag: '', due: '' }),
      op({ kind: 'order', parent: '', ids: ['album', 'gnew', 'work'] }),
      op({ kind: 'delete', gid: 'gnew', ids: ['gnew', 'gsub'] }),
    ]);
    expect(gone).toEqual([expect.objectContaining({ kind: 'order', ids: ['album', 'work'] })]);
  });

  it('повторы одного поля → последнее; не трогает исходные объекты', () => {
    const add = op({ kind: 'add', gid: 'gnew', parent: '', title: 'A', tag: '', due: '' }, 'a');
    const q = compactGoalOps([
      add,
      op({ kind: 'rename', gid: 'gnew', title: 'B' }),
      op({ kind: 'status', gid: 'album', status: 'done' }),
      op({ kind: 'status', gid: 'album', status: 'todo' }, 's2'),
      op({ kind: 'order', parent: 'album', ids: ['mix', 'rec', 'cover'] }),
      op({ kind: 'order', parent: 'album', ids: ['cover', 'rec', 'mix'] }, 'o2'),
      op({ kind: 'delete', gid: 'cover', ids: ['cover'] }, 'd'),
    ]);
    expect((add as { title: string }).title).toBe('A');
    expect(q.map((o) => o.id)).toEqual(['a', 's2', 'o2', 'd']);
    expect(q[2]).toMatchObject({ ids: ['rec', 'mix'] });
  });
});
