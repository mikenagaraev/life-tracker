import { useMemo } from 'react';
import { create } from 'zustand';
import { ApiError, call } from '../core/api';
import { load, save } from '../core/db';
import { uid } from '../core/format';
import { toast } from '../core/ui';
import { applyGoalOps, compactGoalOps, goalId, moved, subtree, type Goal, type GoalOp, type GoalStatus } from './goals';
import { useDay } from './store';
import type { PdfResult } from './statsStore';

interface GoalsStore {
  ready: boolean;
  goals: Goal[]; // копия с сервера
  queue: GoalOp[];
  fetched: number;
  syncing: boolean;
  error: string; // 'offline' — нет сети

  init: () => Promise<void>;
  sync: () => Promise<void>;
  add: (parent: string, title: string, tag?: string, due?: string) => string;
  rename: (id: string, title: string) => void;
  setTag: (id: string, tag: string) => void;
  setStatus: (id: string, status: GoalStatus) => void;
  setDue: (id: string, due: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  reorder: (parent: string, ids: string[]) => void;
  remove: (id: string) => void;
  exportFile: (ids: string[], format: 'pdf' | 'txt', includeDone: boolean) => Promise<PdfResult & { type: string }>;
}

const K = { goals: 'goals:list', queue: 'goals:queue', fetched: 'goals:fetched' };
let initing: Promise<void> | null = null;
let running: Promise<void> | null = null;
let again = false;
let retry: ReturnType<typeof setTimeout> | undefined;
const inflight = new Set<string>();
let kick: ReturnType<typeof setTimeout> | undefined;

/** Правка без id (id добавит очередь); распределённый Omit, чтобы не потерять поля вариантов. */
type NewOp = GoalOp extends infer T ? (T extends GoalOp ? Omit<T, 'id'> : never) : never;

interface OpResult { id: string; status: 'ok' | 'error'; error?: string }

export const useGoals = create<GoalsStore>((set, get) => {
  const view = () => applyGoalOps(get().goals, get().queue);
  function enqueue(op: NewOp) {
    // правки, которые сейчас летят на сервер, не трогаем — сжимаем только остальные
    const q = get().queue;
    const queue = [...q.filter((o) => inflight.has(o.id)), ...compactGoalOps([...q.filter((o) => !inflight.has(o.id)), { ...op, id: uid('o') } as GoalOp])];
    set({ queue });
    void save(K.queue, queue);
    clearTimeout(kick); // несколько правок подряд — одной отправкой
    kick = setTimeout(() => void get().sync(), 1200);
  }

  async function runSync() {
    const conn = useDay.getState().conn;
    if (!conn) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { set({ error: 'offline' }); return; }
    set({ syncing: true });
    const sent = get().queue;
    sent.forEach((o) => inflight.add(o.id));
    try {
      let goals: Goal[];
      if (sent.length) {
        const r = await call<{ results: OpResult[]; goals: Goal[] }>(conn, 'goalOps', { ops: sent }, 60000);
        goals = r.goals;
        const ids = new Set(sent.map((o) => o.id));
        const queue = get().queue.filter((o) => !ids.has(o.id));
        set({ queue, goals }); // вместе со свежим списком — иначе на миг мелькнёт старый
        void save(K.queue, queue);
        const bad = r.results.filter((x) => x.status === 'error');
        if (bad.length) toast(`Цели: ${bad[0].error}${bad.length > 1 ? ` (и ещё ${bad.length - 1})` : ''}`);
      } else {
        goals = await call<Goal[]>(conn, 'goals', {}, 30000);
      }
      const fetched = Date.now();
      set({ goals, fetched, error: '' });
      void save(K.goals, goals);
      void save(K.fetched, fetched);
    } catch (e) {
      const offline = e instanceof ApiError && e.kind === 'network';
      set({ error: offline ? 'offline' : e instanceof Error ? e.message : String(e) });
      clearTimeout(retry);
      if (get().queue.length) retry = setTimeout(() => void get().sync(), 30000);
    } finally {
      inflight.clear();
      set({ syncing: false });
    }
  }

  return {
    ready: false,
    goals: [],
    queue: [],
    fetched: 0,
    syncing: false,
    error: '',

    init() {
      if (!initing) {
        initing = (async () => {
          const [goals, queue, fetched] = await Promise.all([load<Goal[]>(K.goals, []), load<GoalOp[]>(K.queue, []), load<number>(K.fetched, 0)]);
          set({ ready: true, goals, queue, fetched });
          if (typeof window !== 'undefined') {
            window.addEventListener('online', () => void get().sync());
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void get().sync(); });
          }
        })();
      }
      return initing;
    },

    async sync() {
      await get().init();
      if (running) { again = true; return running; }
      running = (async () => {
        do { again = false; await runSync(); } while (again && get().queue.length);
      })();
      try { await running; } finally { running = null; }
    },

    add(parent, title, tag = '', due = '') {
      const gid = goalId();
      enqueue({ kind: 'add', gid, parent, title: title.trim().slice(0, 200), tag: parent ? '' : tag.trim().slice(0, 60), due });
      return gid;
    },
    rename: (gid, title) => enqueue({ kind: 'rename', gid, title: title.trim().slice(0, 200) }),
    setTag: (gid, tag) => enqueue({ kind: 'tag', gid, tag: tag.trim().slice(0, 60) }),
    setStatus: (gid, status) => enqueue({ kind: 'status', gid, status }),
    setDue: (gid, due) => enqueue({ kind: 'due', gid, due }),
    move(gid, dir) {
      const m = moved(view(), gid, dir);
      if (m) enqueue({ kind: 'order', parent: m.parent, ids: m.ids });
    },
    reorder: (parent, ids) => enqueue({ kind: 'order', parent, ids }),
    remove(gid) {
      enqueue({ kind: 'delete', gid, ids: [...subtree(view(), gid)] });
    },

    async exportFile(ids, format, includeDone) {
      await get().sync();
      if (get().queue.length) throw new Error('Не все правки дошли до таблицы — нужен интернет');
      return call(useDay.getState().conn, 'goalsExport', { ids, format, includeDone }, 120000);
    },
  };
});

/** Цели с учётом ещё не отправленных правок. */
export function useGoalsView(): Goal[] {
  const goals = useGoals((s) => s.goals);
  const queue = useGoals((s) => s.queue);
  return useMemo(() => applyGoalOps(goals, queue), [goals, queue]);
}
