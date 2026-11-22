/** Цели трекера дня (лист «Цели»): дерево любой глубины, id постоянный → правки копятся без сети. */

export type GoalStatus = 'todo' | 'doing' | 'done';

export interface Goal {
  id: string;
  parent: string; // '' — цель верхнего уровня
  title: string;
  done: boolean;
  order: number;
  tag: string; // только у верхнего уровня
  status: GoalStatus;
  due: string; // 'YYYY-MM-DD' или ''
}

export type GoalOp =
  | { id: string; kind: 'add'; gid: string; parent: string; title: string; tag: string; due: string }
  | { id: string; kind: 'rename'; gid: string; title: string }
  | { id: string; kind: 'tag'; gid: string; tag: string }
  | { id: string; kind: 'status'; gid: string; status: GoalStatus }
  | { id: string; kind: 'due'; gid: string; due: string }
  | { id: string; kind: 'order'; parent: string; ids: string[] }
  | { id: string; kind: 'delete'; gid: string; ids: string[] }; // ids — цель и все её подзадачи

export const ST_LABEL: Record<GoalStatus, string> = { todo: 'To do', doing: 'В процессе', done: 'Готово' };
export const ST_NEXT: Record<GoalStatus, GoalStatus> = { todo: 'doing', doing: 'done', done: 'todo' };

/** id как у сервера: «g» + 10 символов. */
export function goalId(): string {
  const hex = (crypto.randomUUID?.() || Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/-/g, '');
  return 'g' + hex.slice(0, 10);
}

export function kids(goals: Goal[], pid: string): Goal[] {
  return goals.filter((g) => g.parent === pid).sort((a, b) => a.order - b.order);
}

/** Подзадачи на всех уровнях: сколько всего и сколько готово. */
export function stats(goals: Goal[], id: string): { n: number; k: number } {
  let n = 0, k = 0;
  const walk = (p: string) => kids(goals, p).forEach((c) => { n++; if (c.status === 'done') k++; walk(c.id); });
  walk(id);
  return { n, k };
}

/** Номера «1», «1.2», «1.2.3» по порядку в дереве. */
export function numbers(goals: Goal[]): Record<string, string> {
  const m: Record<string, string> = {};
  const walk = (p: string, pre: string) => kids(goals, p).forEach((g, i) => {
    const n = pre ? `${pre}.${i + 1}` : String(i + 1);
    m[g.id] = n;
    walk(g.id, n);
  });
  walk('', '');
  return m;
}

export function cmpNum(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function pathTo(goals: Goal[], id: string): Goal[] {
  const out: Goal[] = [];
  let g = goals.find((x) => x.id === id);
  while (g) {
    out.unshift(g);
    g = g.parent ? goals.find((x) => x.id === g!.parent) : undefined;
  }
  return out;
}

/** Цель и все её подзадачи. */
export function subtree(goals: Goal[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of goals) if (!out.has(g.id) && out.has(g.parent)) { out.add(g.id); grew = true; }
  }
  return out;
}

/** Теги верхних целей по алфавиту. */
export function topTags(goals: Goal[]): string[] {
  return [...new Set(kids(goals, '').map((g) => g.tag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Цели в фильтре по тегу (верхние с этим тегом и всё под ними). */
export function scopeOf(goals: Goal[], tag: string): Set<string> {
  const out = new Set<string>();
  for (const t of kids(goals, '')) if (!tag || t.tag === tag) subtree(goals, t.id).forEach((id) => out.add(id));
  return out;
}

const dueKey = (g: Goal) => g.due || '9999';

/** «Ближайшие сроки»: незавершённые со сроком, по дате. */
export function upcoming(goals: Goal[], scope: Set<string>, limit = 6): Goal[] {
  return goals.filter((g) => scope.has(g.id) && g.due && g.status !== 'done').sort((a, b) => dueKey(a).localeCompare(dueKey(b))).slice(0, limit);
}

/**
 * «Что сделать дальше» внутри цели: незавершённые шаги без незавершённых подзадач.
 * Сначала «в процессе», потом по сроку, потом по порядку в дереве.
 */
export function nextSteps(goals: Goal[], focus: string): Goal[] {
  const out: { g: Goal; i: number }[] = [];
  let i = 0;
  const walk = (p: string) => kids(goals, p).forEach((c) => {
    const open = kids(goals, c.id).filter((x) => x.status !== 'done');
    if (c.status !== 'done' && !open.length) out.push({ g: c, i });
    i++;
    walk(c.id);
  });
  walk(focus);
  return out.sort((a, b) => (a.g.status === 'doing' ? 0 : 1) - (b.g.status === 'doing' ? 0 : 1) || dueKey(a.g).localeCompare(dueKey(b.g)) || a.i - b.i).map((x) => x.g);
}

export type DueKind = 'late' | 'today' | 'soon' | 'fin';
export function dueInfo(g: Pick<Goal, 'due' | 'status'>, today: string): { kind: DueKind; prefix: string } | null {
  if (!g.due) return null;
  if (g.status === 'done') return { kind: 'fin', prefix: 'до ' };
  if (g.due < today) return { kind: 'late', prefix: 'просрочено · ' };
  if (g.due === today) return { kind: 'today', prefix: 'сегодня · ' };
  return { kind: 'soon', prefix: 'до ' };
}

/** Новый порядок соседей при сдвиге на одну позицию; null — дальше некуда. */
export function moved(goals: Goal[], id: string, dir: -1 | 1): { parent: string; ids: string[] } | null {
  const g = goals.find((x) => x.id === id);
  if (!g) return null;
  const ids = kids(goals, g.parent).map((x) => x.id);
  const i = ids.indexOf(id), j = i + dir;
  if (j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { parent: g.parent, ids };
}

/** Данные сервера + правки, которые ещё не дошли. */
export function applyGoalOps(goals: Goal[], ops: GoalOp[]): Goal[] {
  if (!ops.length) return goals;
  let out = goals.slice();
  const patch = (gid: string, p: Partial<Goal>) => { out = out.map((g) => (g.id === gid ? { ...g, ...p } : g)); };
  for (const op of ops) {
    if (op.kind === 'add') {
      if (out.some((g) => g.id === op.gid)) continue;
      const order = out.filter((g) => g.parent === op.parent).reduce((m, g) => Math.max(m, g.order), 0) + 1;
      out.push({ id: op.gid, parent: op.parent, title: op.title, done: false, order, tag: op.tag, status: 'todo', due: op.due });
    } else if (op.kind === 'rename') patch(op.gid, { title: op.title });
    else if (op.kind === 'tag') patch(op.gid, { tag: op.tag });
    else if (op.kind === 'due') patch(op.gid, { due: op.due });
    else if (op.kind === 'status') patch(op.gid, { status: op.status, done: op.status === 'done' });
    else if (op.kind === 'order') op.ids.forEach((id, i) => patch(id, { order: i + 1 }));
    else if (op.kind === 'delete') { const drop = new Set(op.ids); out = out.filter((g) => !drop.has(g.id)); }
  }
  return out;
}

/**
 * Сжать очередь: повторные правки одного поля → последняя; правки новой (ещё не отправленной) цели
 * вливаются в её создание; удалённое до отправки исчезает целиком.
 */
export function compactGoalOps(ops: GoalOp[]): GoalOp[] {
  const out: GoalOp[] = [];
  for (const op of ops) {
    const ai = 'gid' in op && op.kind !== 'add' ? out.findIndex((o) => o.kind === 'add' && o.gid === op.gid) : -1;
    if (op.kind === 'delete') {
      const drop = new Set(op.ids);
      const wasNew = out.some((o) => o.kind === 'add' && o.gid === op.gid);
      const kept = out.filter((o) => !('gid' in o && drop.has(o.gid)))
        .map((o) => (o.kind === 'order' ? { ...o, ids: o.ids.filter((x) => !drop.has(x)) } : o))
        .filter((o) => o.kind !== 'order' || o.ids.length > 0);
      out.splice(0, out.length, ...kept);
      if (!wasNew) out.push(op);
      continue;
    }
    if (ai >= 0 && (op.kind === 'rename' || op.kind === 'tag' || op.kind === 'due')) {
      const add = out[ai] as Extract<GoalOp, { kind: 'add' }>;
      out[ai] = op.kind === 'rename' ? { ...add, title: op.title } : op.kind === 'tag' ? { ...add, tag: op.tag } : { ...add, due: op.due };
      continue;
    }
    if (op.kind === 'rename' || op.kind === 'tag' || op.kind === 'due' || op.kind === 'status') {
      const i = out.findIndex((o) => o.kind === op.kind && 'gid' in o && o.gid === op.gid);
      if (i >= 0) out.splice(i, 1);
    }
    if (op.kind === 'order') {
      const i = out.findIndex((o) => o.kind === 'order' && o.parent === op.parent);
      if (i >= 0) out.splice(i, 1);
    }
    out.push(op);
  }
  return out;
}
