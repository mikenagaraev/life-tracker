import { create } from 'zustand';
import { ApiError, call, type Conn } from '../core/api';
import { load, save } from '../core/db';
import { addDays, todayIso, uid } from '../core/format';
import { toast } from '../core/ui';
import { PLAN, applyOps, compactOps, keyOf, norm } from './logic';
import type { ApplyResult, DayData, DayItem, DayOp, DayState, DrawType, OneOff } from './types';

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
  setDrawing: (iso: string, dtype: DrawType, data: string) => void;
  sync: (force?: boolean) => Promise<void>;
  structure: (op: StructOp, args: (string | number)[]) => Promise<boolean>;
  saveStates: (list: DayState[]) => Promise<boolean>;
}

/** Правки структуры листа — только онлайн, строки сдвигаются (функции Code.gs через Api.gs). */
export type StructOp = 'addTask' | 'addCategory' | 'renameTask' | 'renameCategory' | 'moveRow' | 'moveCategory' | 'addSummaryItem' | 'removeSummaryItem';

const K = { conn: 'conn:day', days: 'day:days', queue: 'day:queue', states: 'day:states', lastSync: 'day:lastSync' };
const KEEP_DAYS = 60;

let syncing: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let again = false;
let kick: ReturnType<typeof setTimeout> | undefined;
const SEND_DELAY = 1200;

function trimDays(days: Record<string, DayData>, around: string): Record<string, DayData> {
  const keys = Object.keys(days).sort((a, b) => Math.abs(Date.parse(a) - Date.parse(around)) - Math.abs(Date.parse(b) - Date.parse(around)));
  return Object.fromEntries(keys.slice(0, KEEP_DAYS).map((k) => [k, days[k]]));
}

export const useDay = create<DayStore>((set, get) => {
  function enqueue(op: DayOp) {
    const queue = compactOps([...get().queue, op]);
    set({ queue });
    void save(K.queue, queue);
    // Несколько нажатий подряд — одной отправкой (каждый запрос к Apps Script занимает секунды).
    clearTimeout(kick);
    kick = setTimeout(() => void get().sync(), SEND_DELAY);
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
    setDrawing(iso, dtype, data) {
      enqueue({ id: uid('d'), kind: 'drawing', iso, dtype, data });
    },

    async structure(op, args) {
      const s = get();
      if (!s.conn) { toast('Сначала подключи таблицу'); return false; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast('Нужен интернет: дела и категории меняются только онлайн');
        return false;
      }
      try {
        await get().sync(); // сначала отправить отметки — их строки сейчас сдвинутся
        await call(s.conn, 'struct', { op, args });
        await get().sync(true);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
        void get().sync(true);
        return false;
      }
    },

    async saveStates(list) {
      const s = get();
      if (!s.conn) { toast('Сначала подключи таблицу'); return false; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { toast('Нужен интернет, чтобы сохранить состояния'); return false; }
      try {
        const states = await call<DayState[]>(s.conn, 'saveStates', { list }, 30000);
        // новые состояния — сразу во все сохранённые дни, чтобы и без сети показывались они
        const days = Object.fromEntries(Object.entries(get().days).map(([k, d]) => [k, { ...d, states }]));
        set({ states, days });
        await Promise.all([save(K.states, states), save(K.days, days)]);
        void get().sync(true);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
        return false;
      }
    },

    sync(force = false) {
      // Уже идёт отправка — отметим, что после неё нужно ещё раз (новые правки не ждут следующего повода).
      if (syncing) { again = true; return syncing; }
      syncing = run().finally(() => {
        syncing = null;
        if (again) { again = false; void get().sync(); }
      });
      return syncing;

      async function run() {
        const s = get();
        if (!s.conn) return set({ net: 'setup' });
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return set({ net: 'offline' });
        clearTimeout(retry);
        set({ net: 'syncing', error: '' });
        try {
          // Свежие данные: выбранный день и соседние (листать без ожидания).
          const want = () => { const iso = get().iso; return [iso, addDays(iso, -1), addDays(iso, 1)]; };
          const store = async (res: Omit<DayData, 'fetched'>[]) => {
            const fetched = Date.now();
            const days = { ...get().days };
            let states = get().states;
            for (const d of res) {
              days[d.iso] = { ...d, items: d.items.map((i) => ({ ...i, color: norm(i.color) })), fetched };
              if (d.states?.length) states = d.states;
            }
            const trimmed = trimDays(days, get().iso);
            set({ days: trimmed, states, lastSync: fetched });
            await Promise.all([save(K.days, trimmed), save(K.states, states), save(K.lastSync, fetched)]);
          };

          // 1. Отправить очередь. Сервер в том же ответе отдаёт свежие дни — второй запрос не нужен.
          //    Нажатое за время отправки уходит следующим кругом.
          let sentAny = false;
          for (let round = 0; round < 5 && get().queue.length; round++) {
            const sent = get().queue;
            sentAny = true;
            const days = [...new Set([get().iso, ...sent.map((op) => op.iso)])]; // только дни с правками — каждый день на сервере это ~2 с
            const raw = await call<ApplyResult[] | { results: ApplyResult[]; days: Omit<DayData, 'fetched'>[] }>(
              s.conn, 'apply', { ops: sent, days: days.map((d) => ({ iso: d })) });
            const res = Array.isArray(raw) ? raw : raw.results;
            const done = new Set(res.map((r) => r.id));
            for (const r of res) {
              if (r.status === 'conflict') toast('Дело уже отметили в другом месте — оставил как там');
              else if (r.status === 'error') toast(r.error || 'Правка не прошла');
            }
            // Ответ получен по всем отправленным — убираем их; добавленное во время отправки остаётся.
            const queue = get().queue.filter((op) => !done.has(op.id));
            if (!Array.isArray(raw)) {
              set({ queue });
              await Promise.all([save(K.queue, queue), store(raw.days)]);
            } else {
              // старый сервер: принятое переносим в копию дня, чтобы до обновления ничего не мелькало
              const okIds = new Set(res.filter((r) => r.status === 'ok').map((r) => r.id));
              const accepted = sent.filter((op) => okIds.has(op.id));
              const cache = { ...get().days };
              for (const d of new Set(accepted.map((op) => op.iso))) if (cache[d]) cache[d] = applyOps(cache[d], accepted);
              set({ queue, days: cache });
              await Promise.all([save(K.queue, queue), save(K.days, cache)]);
            }
          }
          // 2. Если дни ещё не пришли вместе с отправкой — запросить отдельно.
          const list = want();
          // после отправки выбранный день уже свежий; соседние подтянутся, когда на них перейдут
          const stale = force ? list : sentAny ? [] : list.filter((d) => !get().days[d] || Date.now() - get().days[d].fetched > 60_000);
          if (stale.length) {
            await store(await call<Omit<DayData, 'fetched'>[]>(s.conn, 'days', { days: stale.map((d) => ({ key: keyOf(d), iso: d })) }));
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
