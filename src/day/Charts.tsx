import { useEffect, useMemo } from 'react';
import { Icon } from '../core/icons';
import {
  attention, chartNote, fieldLabel, fieldOptions, overlayDay, prepareHistory, scaleOf, seriesFor, sliceChart, type HistModel,
} from './analytics';
import { CountChart, LevelChart } from './ChartKit';
import type { DayModel } from './logic';
import { HIST_KEY, chartsOf, useDayStats } from './statsStore';
import type { ChartCfg, ChartKind, ChartPeriod, DayData, DayState } from './types';

const PERIODS: { v: ChartPeriod; label: string }[] = [{ v: 7, label: '7 дней' }, { v: 14, label: '14 дней' }, { v: 30, label: '30 дней' }, { v: 90, label: '90 дней' }, { v: 0, label: 'Всё время' }];

/** «Графики»: внимание за выбранный день + свои графики по истории таблицы. */
export function ChartsView({ model, day, states }: { model: DayModel; day: DayData | null; states: DayState[] }) {
  const hist = useDayStats((s) => s.hist);
  const loading = useDayStats((s) => !!s.loading[HIST_KEY]);
  const error = useDayStats((s) => s.errors[HIST_KEY] || '');
  const charts = useDayStats(chartsOf);
  const setCharts = useDayStats((s) => s.setCharts);

  useEffect(() => { void useDayStats.getState().init().then(() => useDayStats.getState().loadHistory()); }, []);

  const h = useMemo(() => (hist ? overlayDay(prepareHistory(hist.v), day) : null), [hist, day]);
  const att = attention(model, states);
  const update = (i: number, patch: Partial<ChartCfg>) => setCharts(charts.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="col" style={{ gap: 14 }}>
      <section className="card" style={{ gap: 12 }}>
        <div className="between" style={{ alignItems: 'baseline' }}><h2>Внимание за день</h2><span className="muted">{att.total ? `отметок: ${att.total}` : ''}</span></div>
        {!att.total && <div className="muted">Пока ничего не отмечено</div>}
        {att.items.map((x) => (
          <div key={x.name} className="col" style={{ gap: 6 }}>
            <div className="between" style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{x.name} <span className="muted">{x.n}</span></span>
              <span style={{ color: 'var(--ink2)' }}>{Math.round((x.n / att.total) * 100)}%</span>
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(x.n / att.total) * 100}%`, background: 'var(--day)' }} /></div>
          </div>
        ))}
        {att.total > 0 && <div className="muted">«В планах» не учитывается — только отмеченное.</div>}
      </section>

      {!h && (loading ? <div className="skeleton" style={{ height: 240 }} />
        : error === 'offline' ? <div className="card row" style={{ gap: 12, color: 'var(--muted)' }}><Icon name="cloudOff" size={22} /><div>Нет интернета, а историю ещё не загружали. Графики появятся, когда будет сеть.</div></div>
        : error ? <div className="banner err"><Icon name="alert" size={22} /><div><b>История не загрузилась</b>{error}</div></div> : null)}
      {h && (loading || error) && (
        <div className="muted row" style={{ gap: 6 }}>
          <Icon name={loading ? 'sync' : 'cloudOff'} size={14} />{loading ? 'Обновляю историю…' : error === 'offline' ? 'Нет сети — графики по сохранённой истории' : `Не обновилось: ${error}`}
        </div>
      )}

      {h && charts.map((cfg, i) => (
        <ChartCard key={i} h={h} cfg={cfg} states={states} onChange={(p) => update(i, p)} onRemove={() => setCharts(charts.filter((_, j) => j !== i))} />
      ))}
      {h && (
        <button type="button" className="add-pill" style={{ alignSelf: 'flex-start' }}
          onClick={() => setCharts([...charts, { field: 'all', kind: 'count', period: 30 }])}>+ Добавить график</button>
      )}
      {h && <div className="muted">Графики сохраняются в таблице и видны в полной версии трекера.</div>}
    </div>
  );
}

function ChartCard({ h, cfg, states, onChange, onRemove }: {
  h: HistModel; cfg: ChartCfg; states: DayState[]; onChange: (p: Partial<ChartCfg>) => void; onRemove: () => void;
}) {
  const scale = useMemo(() => scaleOf(states), [states]);
  const groups = useMemo(() => fieldOptions(h), [h]);
  const known = groups.some((g) => g.options.some((o) => o.value === cfg.field));
  const all = useMemo(() => seriesFor(h, cfg.field, cfg.kind, states), [h, cfg.field, cfg.kind, states]);
  const { vals, dates } = sliceChart(all, h.dates, cfg);
  const has = vals.some((v) => (cfg.kind === 'count' ? (v || 0) > 0 : v !== null));
  const note = chartNote(vals, cfg.kind, scale);
  const title = fieldLabel(cfg.field);

  return (
    <section className="card" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <h2 className="ellipsis">{title}</h2>
          <span className="muted">{cfg.kind === 'count' ? 'количество отметок' : 'уровень состояния'}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={`Убрать график «${title}»`} onClick={onRemove}><Icon name="close" size={18} /></button>
      </div>
      <div className="chart-ctl">
        <select aria-label="Что показывать" value={cfg.field} onChange={(e) => onChange({ field: e.target.value })}>
          {!known && <option value={cfg.field}>{title}</option>}
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          ))}
        </select>
        <select aria-label="Вид графика" value={cfg.kind} onChange={(e) => onChange({ kind: e.target.value as ChartKind })}>
          <option value="level">Уровень</option><option value="count">Количество</option>
        </select>
        <select aria-label="Период" value={cfg.period} onChange={(e) => onChange({ period: Number(e.target.value) as ChartPeriod })}>
          {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
      </div>
      {!has ? <div className="muted">За этот период отметок нет</div>
        : cfg.kind === 'level'
          ? <LevelChart values={vals} labels={dates} scale={scale} label={`${title}: уровень по дням`} />
          : <CountChart values={vals.map((v) => v || 0)} labels={dates} label={`${title}: отметок по дням`} />}
      {has && note && <div className="muted">{note.a} · {note.b}</div>}
    </section>
  );
}
