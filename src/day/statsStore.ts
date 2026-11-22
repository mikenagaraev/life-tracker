import { create } from 'zustand';
import { ApiError, call } from '../core/api';
import { load, save } from '../core/db';
import { DEFAULT_CHARTS, cleanCharts, reportKey } from './analytics';
import { useDay } from './store';
import type { ChartCfg, History, Report } from './types';

/**
 * Сводка и графики трекера дня. Только чтение с сервера + настройка графиков.
 * Всё, что уже загружалось, хранится на телефоне и показывается без сети.
 */
interface Cached<T> { v: T; at: number }

export interface PdfResult { url: string; name: string; id: string; download: string; b64: string }

interface StatsStore {
  ready: boolean;
  reports: Record<string, Cached<Report>>;
  hist: Cached<History> | null;
  charts: ChartCfg[] | null; // своя копия: меняется и без сети
  chartsDirty: boolean;
  loading: Record<string, boolean>;
  errors: Record<string, string>;

  init: () => Promise<void>;
  loadReport: (from: string, to: string, cats: string[] | null) => Promise<void>;
  loadHistory: () => Promise<void>;
  setCharts: (list: ChartCfg[]) => void;
  makePdf: (from: string, to: string, cats: string[] | null, images: (r: Report) => Promise<Record<string, string>>) => Promise<PdfResult>;
}

const K = { reports: 'day:reports', hist: 'day:hist', charts: 'day:charts', dirty: 'day:chartsDirty' };
const KEEP_REPORTS = 16;
const HIST = 'hist';

let initing: Promise<void> | null = null;

function errText(e: unknown): string {
  if (e instanceof ApiError && e.kind === 'network') return 'offline';
  return e instanceof Error ? e.message : String(e);
}

export const useDayStats = create<StatsStore>((set, get) => {
  function busy(key: string, on: boolean, error?: string) {
    set((s) => ({ loading: { ...s.loading, [key]: on }, errors: error === undefined ? s.errors : { ...s.errors, [key]: error } }));
  }

  async function pushCharts() {
    const { charts, chartsDirty } = get();
    const conn = useDay.getState().conn;
    if (!chartsDirty || !charts || !conn) return;
    try {
      await call(conn, 'saveCharts', { list: charts });
      set({ chartsDirty: false });
      void save(K.dirty, false);
    } catch { /* повторим при следующей загрузке истории */ }
  }

  return {
    ready: false,
    reports: {},
    hist: null,
    charts: null,
    chartsDirty: false,
    loading: {},
    errors: {},

    init() {
      if (!initing) {
        initing = (async () => {
          const [reports, hist, charts, chartsDirty] = await Promise.all([
            load<Record<string, Cached<Report>>>(K.reports, {}),
            load<Cached<History> | null>(K.hist, null),
            load<ChartCfg[] | null>(K.charts, null),
            load<boolean>(K.dirty, false),
          ]);
          set({ ready: true, reports, hist, charts, chartsDirty });
        })();
      }
      return initing;
    },

    async loadReport(from, to, cats) {
      await get().init();
      const key = reportKey(from, to, cats);
      const conn = useDay.getState().conn;
      if (!conn) return;
      busy(key, true, '');
      try {
        const r = await call<Report>(conn, 'report', { from, to, cats }, 60000);
        const reports = { ...get().reports, [key]: { v: r, at: Date.now() } };
        const keep = Object.entries(reports).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP_REPORTS);
        set({ reports: Object.fromEntries(keep) });
        void save(K.reports, Object.fromEntries(keep));
        busy(key, false, '');
      } catch (e) {
        busy(key, false, errText(e));
      }
    },

    async loadHistory() {
      await get().init();
      const conn = useDay.getState().conn;
      if (!conn) return;
      busy(HIST, true, '');
      try {
        await pushCharts();
        const h = await call<History>(conn, 'history', {}, 60000);
        const hist = { v: h, at: Date.now() };
        set({ hist });
        void save(K.hist, hist);
        if (!get().chartsDirty) { set({ charts: h.charts }); void save(K.charts, h.charts); }
        busy(HIST, false, '');
      } catch (e) {
        busy(HIST, false, errText(e));
      }
    },

    setCharts(list) {
      const charts = cleanCharts(list);
      set({ charts, chartsDirty: true });
      void save(K.charts, charts);
      void save(K.dirty, true);
      void pushCharts();
    },

    async makePdf(from, to, cats, images) {
      const conn = useDay.getState().conn;
      // рисунки дня нужны только для PDF — их тянем отдельно, чтобы обычная сводка была лёгкой
      const full = await call<Report>(conn, 'report', { from, to, cats, drawings: true }, 60000);
      return call<PdfResult>(conn, 'pdf', { from, to, cats, images: await images(full) }, 120000);
    },
  };
});

export const chartsOf = (s: Pick<StatsStore, 'charts' | 'hist'>): ChartCfg[] => s.charts || s.hist?.v.charts || DEFAULT_CHARTS;
export const HIST_KEY = HIST;
