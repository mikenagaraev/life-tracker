import { create } from 'zustand';
import { ApiError, call, type Conn } from '../core/api';
import { load, save } from '../core/db';
import { todayIso } from '../core/format';
import { DEFAULT_CATS, DEFAULT_MINE } from './data';
import { ackPending, mergeOps } from './logic';
import type { CatNode, Op, Rates } from './types';

export type NetState = 'idle' | 'syncing' | 'offline' | 'error' | 'auth' | 'setup';

interface Settings {
  mine: string[];
  statsCur: 'USD' | 'GEL';
}

interface FinanceState {
  ready: boolean;
  conn: Conn | null;
  server: Op[]; // последняя копия листа «Операции»
  pending: Record<string, Op>; // ещё не отправлено
  ops: Record<string, Op>; // то, что видит пользователь
  cats: CatNode[];
  catsDirty: boolean;
  settings: Settings;
  settingsDirty: boolean;
  rates: Rates | null;
  net: NetState;
  error: string;
  lastSync: number;

  init: () => Promise<void>;
  setConn: (conn: Conn) => Promise<void>;
  saveOp: (op: Op) => void;
  deleteOp: (id: string) => void;
  setCats: (cats: CatNode[]) => void;
  setSettings: (patch: Partial<Settings>) => void;
  sync: () => Promise<void>;
}

const K = {
  conn: 'conn:finance',
  server: 'fin:server',
  pending: 'fin:pending',
  cats: 'fin:cats',
  catsDirty: 'fin:catsDirty',
  settings: 'fin:settings',
  settingsDirty: 'fin:settingsDirty',
  rates: 'fin:rates',
  lastSync: 'fin:lastSync',
};

const DEFAULT_SETTINGS: Settings = { mine: DEFAULT_MINE, statsCur: 'USD' };

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let syncing: Promise<void> | null = null;

export const useFinance = create<FinanceState>((set, get) => ({
  ready: false,
  conn: null,
  server: [],
  pending: {},
  ops: {},
  cats: DEFAULT_CATS,
  catsDirty: false,
  settings: DEFAULT_SETTINGS,
  settingsDirty: false,
  rates: null,
  net: 'idle',
  error: '',
  lastSync: 0,

  async init() {
    const [conn, server, pending, cats, catsDirty, settings, settingsDirty, rates, lastSync] = await Promise.all([
      load<Conn | null>(K.conn, null),
      load<Op[]>(K.server, []),
      load<Record<string, Op>>(K.pending, {}),
      load<CatNode[] | null>(K.cats, null),
      load<boolean>(K.catsDirty, false),
      load<Settings>(K.settings, DEFAULT_SETTINGS),
      load<boolean>(K.settingsDirty, false),
      load<Rates | null>(K.rates, null),
      load<number>(K.lastSync, 0),
    ]);
    set({
      ready: true,
      conn,
      server,
      pending,
      ops: mergeOps(server, pending),
      cats: cats || DEFAULT_CATS,
      catsDirty,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      settingsDirty,
      rates,
      lastSync,
      net: conn ? 'idle' : 'setup',
    });
    if (conn) void get().sync();
  },

  async setConn(conn) {
    await save(K.conn, conn);
    set({ conn, net: 'idle', error: '' });
    await get().sync();
  },

  saveOp(op) {
    const pending = { ...get().pending, [op.id]: { ...op, updated: Date.now() } };
    set({ pending, ops: mergeOps(get().server, pending) });
    void save(K.pending, pending);
    void get().sync();
  },

  deleteOp(id) {
    const cur = get().ops[id] || get().pending[id];
    if (!cur) return;
    const pending = { ...get().pending, [id]: { ...cur, deleted: true, updated: Date.now() } };
    set({ pending, ops: mergeOps(get().server, pending) });
    void save(K.pending, pending);
    void get().sync();
  },

  setCats(cats) {
    set({ cats, catsDirty: true });
    void save(K.cats, cats);
    void save(K.catsDirty, true);
    void get().sync();
  },

  setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings, settingsDirty: true });
    void save(K.settings, settings);
    void save(K.settingsDirty, true);
    void get().sync();
  },

  sync() {
    if (syncing) return syncing;
    syncing = doSync().finally(() => {
      syncing = null;
    });
    return syncing;

    async function doSync() {
      const s = get();
      if (!s.conn) return set({ net: 'setup' });
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return set({ net: 'offline' });
      clearTimeout(retryTimer);
      set({ net: 'syncing', error: '' });
      try {
        // 1. Отправляем очередь операций.
        const sent = Object.values(get().pending);
        if (sent.length) {
          const r = await call<{ applied: string[] }>(s.conn, 'sync', { ops: sent });
          const pending = ackPending(get().pending, sent, r.applied);
          set({ pending });
          await save(K.pending, pending);
        }
        // 2. Категории и настройки: локальные правки важнее, иначе берём с сервера.
        if (get().catsDirty) {
          const snapshot = get().cats;
          await call(s.conn, 'saveCats', { cats: snapshot });
          if (get().cats === snapshot) {
            set({ catsDirty: false });
            await save(K.catsDirty, false);
          }
        } else {
          const remote = await call<CatNode[]>(s.conn, 'getCats');
          if (remote.length) {
            set({ cats: remote });
            await save(K.cats, remote);
          } else {
            await call(s.conn, 'saveCats', { cats: get().cats }); // первый запуск: заливаем стартовое дерево
          }
        }
        if (get().settingsDirty) {
          const snapshot = get().settings;
          await call(s.conn, 'setSettings', { key: 'finance', value: snapshot });
          if (get().settings === snapshot) {
            set({ settingsDirty: false });
            await save(K.settingsDirty, false);
          }
        } else {
          const remote = await call<Partial<Settings> | null>(s.conn, 'getSettings', { key: 'finance' });
          if (remote) {
            const settings = { ...DEFAULT_SETTINGS, ...remote };
            set({ settings });
            await save(K.settings, settings);
          }
        }
        // 3. Свежая копия операций и курс дня.
        const server = await call<Op[]>(s.conn, 'list');
        const rates = get().rates?.date === todayIso() ? get().rates : await call<Rates>(s.conn, 'rates', { date: todayIso() }).catch(() => get().rates);
        const lastSync = Date.now();
        set({ server, rates, lastSync, ops: mergeOps(server, get().pending), net: 'idle' });
        await Promise.all([save(K.server, server), save(K.rates, rates), save(K.lastSync, lastSync)]);
        // Пока синхронизировались, могли добавить новое — отправим следующим заходом.
        if (Object.keys(get().pending).length) retryTimer = setTimeout(() => void get().sync(), 1000);
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(String(e), 'server');
        const net: NetState = err.kind === 'auth' ? 'auth' : err.kind === 'config' ? 'setup' : err.kind === 'network' ? 'offline' : 'error';
        set({ net, error: err.message });
        if (net === 'offline' || net === 'error') retryTimer = setTimeout(() => void get().sync(), 30000);
      }
    }
  },
}));

/** Синхронизация при появлении сети и при возвращении в приложение. */
export function startAutoSync() {
  const run = () => void useFinance.getState().sync();
  window.addEventListener('online', run);
  window.addEventListener('offline', () => useFinance.setState({ net: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}

export function pendingCount(s: Pick<FinanceState, 'pending'>): number {
  return Object.keys(s.pending).length;
}
