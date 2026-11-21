import { create } from 'zustand';
import { ApiError, call, type Conn } from '../core/api';
import { load, save } from '../core/db';
import { addDays, todayIso, uid } from '../core/format';
import { toast } from '../core/ui';
import { PLAN, applyOps, compactOps, keyOf, norm } from './logic';
import type { ApplyResult, DayData, DayItem, DayOp, DayState, OneOff } from './types';

export type DayNet = 'idle' | 'syncing' | 'offline' | 'error' | 'auth' | 'setup';

interface DayStore {
  ready: boolean;
  conn: Conn | null;
  days: Record<string, DayData>; // копия с сервера по датам
  queue: DayOp[];
  states: DayState[];
  iso: string; // выбранная дата
  net: DayNet;
  error: string;
  lastSync: number;

  init: () => Promise<void>;
  setConn: (c: Conn) => Promise<void>;
  setIso: (iso: string) => void;
  view: (iso?: string) => DayData | null;
  setColor: (item: DayItem, color: string) => void;
  setComment: (text: string) => void;
  addOneOff: (name: string, cat: string) => void;
  setOneOffColor: (o: OneOff, color: string) => void;
  deleteOneOff: (o: OneOff) => void;
  sync: (force?: boolean) => Promise<void>;
}

const K = { conn: 'conn:day', days: 'day:days', queue: 'day:queue', states: 'day:states', lastSync: 'day:lastSync' };
const KEEP_DAYS = 60;

let syncing: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;

function trimDays(days: Record<string, DayData>, around: string): Record<string, DayData> {
  const keys = Object.keys(days).sort((a, b) => Math.abs(Date.parse(a) - Date.parse(around)) - Math.abs(Date.parse(b) - Date.parse(around)));
  return Object.fromEntries(keys.slice(0, KEEP_DAYS).map((k) => [k, days[k]]));
}

export const useDay = create<DayStore>((set, get) => {
  function enqueue(op: DayOp) {
    const queue = compactOps([...get().queue, op]);
    set({ queue });
    void save(K.queue, queue);
    void get().sync();
  }

  return {
    ready: false,
    conn: null,
    days: {},
    queue: [],
    states: [],
    iso: todayIso(),
    net: 'idle',
    error: '',
    lastSync: 0,

    async init() {
      const [conn, days, queue, states, lastSync] = await Promise.all([
        load<Conn | null>(K.conn, null),
        load<Record<string, DayData>>(K.days, {}),
        load<DayOp[]>(K.queue, []),
        load<DayState[]>(K.states, []),
        load<number>(K.lastSync, 0),
      ]);
      set({ ready: true, conn, days, queue, states, lastSync, net: conn ? 'idle' : 'setup' });
      if (conn) void get().sync();
    },

    async setConn(conn) {
      await save(K.conn, conn);
      set({ conn, net: 'idle', error: '' });
      await get().sync(true);
    },

    setIso(iso) {
      set({ iso });
      const d = get().days[iso];
      if (!d || Date.now() - d.fetched > 60_000) void get().sync(true);
    },

    view(iso = get().iso) {
      const d = get().days[iso];
      return d ? applyOps(d, get().queue) : null;
    },

    setColor(item, color) {
      const iso = get().iso;
      const cur = get().view(iso)?.items.find((i) => i.row === item.row && i.name === item.name);
      enqueue({ id: uid('d'), kind: 'color', iso, key: keyOf(iso), row: item.row, name: item.name, color: norm(color), prev: norm(cur?.color ?? item.color) });
    },

    setComment(text) {
      const iso = get().iso;
      enqueue({ id: uid('d'), kind: 'comment', iso, key: keyOf(iso), text: text.trim() });
    },

    addOneOff(name, cat) {
      const iso = get().iso;
      enqueue({ id: uid('d'), kind: 'oneoffAdd', iso, oneId: crypto.randomUUID(), name: name.trim(), cat, color: PLAN });
    },

    setOneOffColor(o, color) {
      enqueue({ id: uid('d'), kind: 'oneoffColor', iso: get().iso, oneId: o.id, color: norm(color) || PLAN });
    },

    deleteOneOff(o) {
      enqueue({ id: uid('d'), kind: 'oneoffDelete', iso: get().iso, oneId: o.id });
    },

    sync(force = false) {
      if (syncing) return syncing;
      syncing = run().finally(() => { syncing = null; });
      return syncing;

      async function run() {
        const s = get();
        if (!s.conn) return set({ net: 'setup' });
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return set({ net: 'offline' });
        clearTimeout(retry);
        set({ net: 'syncing', error: '' });
        try {
          // 1. Отправить очередь.
          const sent = get().queue;
          if (sent.length) {
            const res = await call<ApplyResult[]>(s.conn, 'apply', { ops: sent });
            const done = new Set(res.map((r) => r.id));
            for (const r of res) {
              if (r.status === 'conflict') toast('Дело уже отметили в другом месте — оставил как там');
              else if (r.status === 'error') toast(r.error || 'Правка не прошла');
            }
            // Ответ получен по всем отправленным — убираем их; добавленное во время отправки остаётся.
            const queue = get().queue.filter((op) => !done.has(op.id));
            set({ queue });
            await save(K.queue, queue);
          }
          // 2. Свежие данные: выбранный день и соседние (листать без ожидания).
          const iso = get().iso;
          const want = [iso, addDays(iso, -1), addDays(iso, 1)];
          const stale = force || sent.length ? want : want.filter((d) => !get().days[d] || Date.now() - get().days[d].fetched > 60_000);
          if (stale.length) {
            const res = await call<Omit<DayData, 'fetched'>[]>(s.conn, 'days', { days: stale.map((d) => ({ key: keyOf(d), iso: d })) });
            const fetched = Date.now();
            const days = { ...get().days };
            let states = get().states;
            for (const d of res) {
              days[d.iso] = { ...d, items: d.items.map((i) => ({ ...i, color: norm(i.color) })), fetched };
              if (d.states?.length) states = d.states;
            }
            const trimmed = trimDays(days, iso);
            set({ days: trimmed, states, lastSync: fetched });
            await Promise.all([save(K.days, trimmed), save(K.states, states), save(K.lastSync, fetched)]);
          }
          set({ net: 'idle' });
          if (get().queue.length) retry = setTimeout(() => void get().sync(), 800);
        } catch (e) {
          const err = e instanceof ApiError ? e : new ApiError(String(e), 'server');
          const net: DayNet = err.kind === 'auth' ? 'auth' : err.kind === 'config' ? 'setup' : err.kind === 'network' ? 'offline' : 'error';
          set({ net, error: err.message });
          if (net === 'offline' || net === 'error') retry = setTimeout(() => void get().sync(), 30000);
        }
      }
    },
  };
});

export function startDayAutoSync() {
  const run = () => void useDay.getState().sync();
  window.addEventListener('online', run);
  window.addEventListener('offline', () => useDay.setState({ net: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const s = useDay.getState();
      if (s.iso !== todayIso() && Date.now() - s.lastSync > 6 * 3600_000) s.setIso(todayIso()); // утром открываем «сегодня»
      run();
    }
  });
}
