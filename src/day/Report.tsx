import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { pref } from '../core/db';
import { monthGen, parseIso } from '../core/format';
import { Icon } from '../core/icons';
import { Seg, toast } from '../core/ui';
import {
  MAX_REPORT_DAYS, daysBetween, doneByCat, groupByCat, levelState, reportKey, reportRange, scaleOf, trendWord, type RpPeriod,
} from './analytics';
import { LevelChart } from './ChartKit';
import { reportImages } from './pdfImages';
import { useDay } from './store';
import { useDayStats, type PdfResult } from './statsStore';
import type { DayState, Report, RpDay } from './types';

const dateRu = (iso: string) => { const d = parseIso(iso); return `${d.getDate()} ${monthGen(d.getMonth())}`; };
const weekday = (iso: string) => parseIso(iso).toLocaleDateString('ru-RU', { weekday: 'long' });
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`;
};

export const Dia = ({ color, size = 9 }: { color?: string; size?: number }) =>
  color ? <i className="dia" style={{ background: color, width: size, height: size }} /> : null;

function readCats(): string[] | null {
  try { const c = JSON.parse(pref('day:rpcats') || 'null'); return Array.isArray(c) ? c : null; } catch { return null; }
}

/** «Сводка»: период до выбранной даты, фильтр категорий, инсайты, дни, PDF. */
export function ReportView({ iso, allCats }: { iso: string; allCats: string[] }) {
  const [p, setP] = useState<RpPeriod>(() => (pref('day:rp') as RpPeriod) || 'day');
  const [cf, setCf] = useState(''), [ct, setCt] = useState('');
  const [cats, setCatsRaw] = useState<string[] | null>(readCats);
  const [filterOpen, setFilterOpen] = useState(false);
  const net = useDay((s) => s.net);

  // категории, которых больше нет, из фильтра выпадают; «все отмечены» = без фильтра
  const live = cats && allCats.length ? cats.filter((c) => allCats.includes(c)) : cats;
  const filt = live && live.length === allCats.length && allCats.length ? null : live;
  const setCats = (c: string[] | null) => { setCatsRaw(c); pref('day:rpcats', JSON.stringify(c)); };

  const [from, to] = reportRange(p, iso, cf, ct);
  const span = daysBetween(from, to);
  const key = reportKey(from, to, filt);
  const cached = useDayStats((s) => s.reports[key]);
  const loading = useDayStats((s) => !!s.loading[key]);
  const error = useDayStats((s) => s.errors[key] || '');
  const ready = useDayStats((s) => s.ready);
  const noCats = !!filt && !filt.length;

  useEffect(() => { void useDayStats.getState().init(); }, []);
  useEffect(() => {
    if (noCats || span > MAX_REPORT_DAYS) return;
    const t = setTimeout(() => void useDayStats.getState().loadReport(from, to, filt), 300);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (v: RpPeriod) => { setP(v); pref('day:rp', v); };
  const toggle = (c: string) => {
    const cur = filt || allCats;
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : allCats.filter((x) => cur.includes(x) || x === c);
    setCats(next.length === allCats.length ? null : next);
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <section className="card" style={{ gap: 12 }}>
        <Seg<RpPeriod> small label="Период сводки" value={p} onChange={choose}
          items={[{ key: 'day', label: 'День' }, { key: '7', label: '7 дней' }, { key: '30', label: '30 дней' }, { key: 'custom', label: 'Период' }]} />
        {p === 'custom' && (
          <div className="row" style={{ gap: 8 }}>
            <label className="col" style={{ gap: 4, flex: 1 }}><span className="label">С</span>
              <input className="field" type="date" value={from} max={to} onChange={(e) => e.target.value && setCf(e.target.value)} style={{ padding: 10 }} /></label>
            <label className="col" style={{ gap: 4, flex: 1 }}><span className="label">По</span>
              <input className="field" type="date" value={to} min={from} onChange={(e) => e.target.value && setCt(e.target.value)} style={{ padding: 10 }} /></label>
          </div>
        )}
        <button type="button" className="between" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}
          style={{ border: 0, background: 'none', padding: 0, minHeight: 32, textAlign: 'left' }}>
          <span className="label">Категории: <span style={{ color: 'var(--ink)' }}>{!filt ? 'все' : filt.length ? filt.join(', ') : 'ни одной'}</span></span>
          <Icon name={filterOpen ? 'up' : 'down'} size={16} stroke={2.4} />
        </button>
        {filterOpen && (
          <div className="col" style={{ gap: 8 }}>
            <div className="wrap" style={{ gap: 6 }}>
              {allCats.map((c) => (
                <button key={c} type="button" className={'chip' + (!filt || filt.includes(c) ? ' on' : '')} aria-pressed={!filt || filt.includes(c)} onClick={() => toggle(c)}>{c}</button>
              ))}
            </div>
            <div className="row" style={{ gap: 16 }}>
              <button type="button" className="link" style={{ minHeight: 32 }} onClick={() => setCats(null)}>Все</button>
              <button type="button" className="link" style={{ minHeight: 32 }} onClick={() => setCats([])}>Снять все</button>
            </div>
          </div>
        )}
        <PdfButton from={from} to={to} cats={filt} disabled={!cached || noCats || net === 'offline'} />
      </section>

      <div className="between" style={{ alignItems: 'baseline' }}>
        <h2 style={{ fontSize: 20 }}>{from === to ? dateRu(from) : from.slice(0, 7) === to.slice(0, 7) ? `${parseIso(from).getDate()}–${dateRu(to)}` : `${dateRu(from)} — ${dateRu(to)}`}</h2>
        <span className="muted">{from === to ? weekday(from) : `${span} дн.`}</span>
      </div>

      {noCats ? <Empty>Выбери хотя бы одну категорию</Empty>
        : span > MAX_REPORT_DAYS ? <Empty>Слишком длинный период — максимум {MAX_REPORT_DAYS} дня</Empty>
        : !cached ? (
          loading || !ready ? <><div className="skeleton" style={{ height: 110 }} /><div className="skeleton" style={{ height: 220 }} /></>
            : error === 'offline' ? <Empty icon="cloudOff">Нет интернета, а эту сводку ещё не открывали. Она загрузится, когда появится сеть.</Empty>
            : error ? <div className="banner err"><Icon name="alert" size={22} /><div><b>Сводка не загрузилась</b>{error}</div></div>
            : <div className="skeleton" style={{ height: 110 }} />
        ) : (
          <>
            {(loading || error) && (
              <div className="muted row" style={{ gap: 6 }}>
                <Icon name={loading ? 'sync' : 'cloudOff'} size={14} />
                {loading ? 'Обновляю…' : error === 'offline' ? `Нет сети — сводка от ${ago(cached.at)}` : `Не обновилось: ${error}`}
              </div>
            )}
            <ReportBody r={cached.v} />
          </>
        )}
    </div>
  );
}

function Empty({ children, icon = 'calendar' }: { children: ReactNode; icon?: string }) {
  return <div className="card row" style={{ gap: 12, color: 'var(--muted)' }}><Icon name={icon} size={22} /><div>{children}</div></div>;
}

function PdfButton({ from, to, cats, disabled }: { from: string; to: string; cats: string[] | null; disabled: boolean }) {
  const [state, setState] = useState<'idle' | 'busy'>('idle');
  const [res, setRes] = useState<PdfResult | null>(null);
  const [forKey, setForKey] = useState('');
  const key = reportKey(from, to, cats);
  const file = res && forKey === key ? res : null;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

  async function make() {
    setState('busy');
    try {
      const r = await useDayStats.getState().makePdf(from, to, cats, reportImages);
      setRes(r); setForKey(key);
    } catch (e) {
      toast('PDF не получился: ' + (e instanceof Error ? e.message : String(e)));
    }
    setState('idle');
  }
  function share() {
    if (!file) return;
    try {
      const bin = atob(file.b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const f = new File([u8], file.name, { type: 'application/pdf' });
      if (!navigator.canShare({ files: [f] })) throw new Error('no');
      navigator.share({ files: [f], title: file.name }).catch((err) => { if (err?.name !== 'AbortError') toast('Не получилось — нажми «Скачать»'); });
    } catch { toast('Этот браузер не умеет отправлять файлы — нажми «Скачать»'); }
  }

  if (file) {
    return (
      <div className="col" style={{ gap: 8, padding: 12, borderRadius: 14, background: 'var(--ok-bg)' }}>
        <div style={{ color: 'var(--ok)', fontWeight: 600, fontSize: 14 }}>PDF готов · {file.name}</div>
        <div className="wrap" style={{ gap: 6 }}>
          {canShare && <button type="button" className="chip on" onClick={share}>Поделиться…</button>}
          <a className="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={file.download} target="_blank" rel="noreferrer">Скачать</a>
          <a className="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={file.url} target="_blank" rel="noreferrer">В Google Диске</a>
        </div>
        <div className="muted">Файл сохранён в папке «Трекер дня — отчёты» на Google Диске.</div>
      </div>
    );
  }
  return (
    <button type="button" className="secondary" disabled={disabled || state === 'busy'} onClick={make}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Icon name={state === 'busy' ? 'sync' : 'lend'} size={18} />{state === 'busy' ? 'Готовлю PDF…' : 'Скачать PDF'}
    </button>
  );
}

/* ---------- содержимое сводки ---------- */

function Tile({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="card" style={{ gap: 4, padding: 14 }}>
      <div className="row" style={{ gap: 8, font: '800 22px/1.15 var(--head)' }}>{color && <Dia color={color} size={12} />}<span>{value}</span></div>
      <div className="muted">{label}</div>
    </div>
  );
}

function Block({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="card" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}><h2>{title}</h2>{meta && <span className="muted">{meta}</span>}</div>
      {children}
    </section>
  );
}

export function ReportBody({ r }: { r: Report }) {
  const I = r.insights, multi = r.days.length > 1, F = !!r.filter;
  const scale = useMemo(() => scaleOf(r.states), [r.states]);
  const L = (v: number | null) => levelState(scale, v);
  const md = I.moodName === 'День' ? 'день' : 'настроение';
  const cmp = (m: number | null) => (m === null || I.moodAvg === null ? null
    : m - I.moodAvg >= 0.5 ? <span style={{ color: 'var(--ok)' }}> ↑ выше обычного</span>
    : I.moodAvg - m >= 0.5 ? <span style={{ color: 'var(--err)' }}> ↓ ниже обычного</span> : null);

  return (
    <>
      {F && <div className="muted">Отчёт по категориям: <b style={{ color: 'var(--ink)' }}>{r.filter!.join(', ')}</b>. Уровень дня — средняя оценка дел этих категорий.</div>}
      {multi && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Tile value={I.total} label="сделано" />
            <Tile value={I.perDay.toFixed(1).replace('.', ',')} label="в среднем за день" />
            <Tile value={L(I.avgLevel)?.name || '—'} color={L(I.avgLevel)?.color} label={F ? 'средний уровень' : 'средний день'} />
            <Tile value={trendWord(I.trend)} label={F ? 'динамика' : 'динамика дня'} />
          </div>

          <Block title={F ? 'Развитие' : 'Динамика дня'} meta={`оценок: ${I.levelDays} из ${I.daysTotal}`}>
            {I.levelDays ? (
              <>
                <LevelChart values={r.days.map((d) => d.level)} labels={r.days.map((d) => d.key)} scale={scale} bars={F ? r.days.map((d) => d.count) : undefined}
                  label={`${F ? 'Уровень' : 'Оценка дня'} по дням, среднее — ${L(I.avgLevel)?.name}`}
                  tip={(i) => { const d = r.days[i]; return `${dateRu(d.iso)} — ${L(d.level)?.name || 'нет оценки'} · сделано ${d.count}`; }} />
                <div className="muted">
                  {F && 'Линия — средняя оценка дел за день, столбики — сколько сделано. '}
                  Лучший день: <b>{I.best}</b> · самый слабый: <b>{I.worst}</b>
                </div>
              </>
            ) : <div className="muted">{F ? 'За период в этих категориях нет отметок' : '«День» за период не отмечался'}</div>}
          </Block>

          <Block title="Топ-10 по вниманию" meta={I.moodAvg !== null ? <span className="row" style={{ gap: 6 }}>{md === 'день' ? 'средний день' : 'среднее настроение'}: <Dia color={L(I.moodAvg)?.color} />{L(I.moodAvg)?.name}</span> : undefined}>
            {!I.top.length && <div className="muted">Отметок пока нет</div>}
            {(() => {
              const ranked = I.top.map((t, i) => ({ ...t, rank: i + 1 }));
              const groups = groupByCat(ranked), many = groups.length > 1;
              const row = (t: (typeof ranked)[number]) => (
                <div key={t.rank} className="row" style={{ gap: 12, alignItems: 'flex-start', padding: '6px 0' }}>
                  <b style={{ width: 18, flex: 'none', textAlign: 'right', color: 'var(--faint)' }}>{t.rank}</b>
                  <div className="grow">
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    <span className="muted">{many ? '' : `${t.cat} · `}{t.count} отм. · оценка {L(t.avg)?.name || '—'}</span>
                    {t.mood !== null && <span className="muted row" style={{ gap: 6, flexWrap: 'wrap' }}>{md} в эти дни: <Dia color={L(t.mood)?.color} />{L(t.mood)?.name}{cmp(t.mood)}</span>}
                  </div>
                  <span style={{ paddingTop: 4 }}><Dia color={L(t.avg)?.color} size={11} /></span>
                </div>
              );
              return many ? groups.map(([c, xs]) => (
                <div key={c} className="col" style={{ gap: 0 }}>
                  <div className="between caps" style={{ paddingTop: 4 }}><span>{c}</span><span>{xs.reduce((s, t) => s + t.count, 0)} отм.</span></div>
                  {xs.map(row)}
                </div>
              )) : ranked.map(row);
            })()}
            {I.cats.length > 0 && <div className="muted">По категориям: {I.cats.map((c) => `${c.name} — ${c.count}`).join(' · ')}</div>}
          </Block>

          <Block title="Самые яркие события">
            {!I.bright.length && <div className="muted">Пока нечего выделить</div>}
            {I.bright.map((b) => (
              <div key={b.iso} className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--line2)' }}>
                <div className="row" style={{ gap: 8, fontWeight: 600 }}>{dateRu(b.iso)}{b.level !== null && <span className="muted row" style={{ gap: 6 }}><Dia color={L(b.level)?.color} />{F ? 'уровень ' : ''}{L(b.level)?.name}</span>}</div>
                {b.highlights.length > 0 && <div className="wrap" style={{ gap: 6 }}>{b.highlights.map((x, i) => <span key={i} className="mark"><Dia color={x.color} />{x.name}</span>)}</div>}
                {b.comment && <Quote text={b.comment} />}
              </div>
            ))}
          </Block>

          <Growth r={r} L={L} />
        </>
      )}
      {multi ? <DayList days={r.days} scale={scale} F={F} /> : r.days[0] && (
        <section className="card" style={{ gap: 12 }}>
          <div className="between" style={{ alignItems: 'baseline' }}>
            <h2>Что было сделано</h2>
            <span className="muted row" style={{ gap: 6 }}>{r.days[0].level !== null ? <><Dia color={r.days[0].dayColor} />{F ? 'уровень' : 'день'}: {L(r.days[0].level)?.name}</> : `сделано: ${r.days[0].count}`}</span>
          </div>
          <DayDetail d={r.days[0]} />
        </section>
      )}
    </>
  );
}

function Quote({ text }: { text: string }) {
  return <div style={{ padding: '8px 12px', borderLeft: '3px solid var(--day)', background: 'var(--day-soft)', borderRadius: '0 10px 10px 0', whiteSpace: 'pre-line', fontSize: 14 }}>{text}</div>;
}

function Growth({ r, L }: { r: Report; L: (v: number | null) => DayState | null }) {
  const I = r.insights;
  const parts: ReactNode[] = [];
  const grpLine = <T extends { cat: string }>(arr: T[], fmt: (x: T) => string) => {
    const gs = groupByCat(arr);
    return gs.length > 1 ? gs.map(([c, xs]) => <div key={c}><span className="muted">{c}: </span>{xs.map(fmt).join(' · ')}</div>) : arr.map(fmt).join(' · ');
  };
  if (I.lowDays.length) parts.push(
    <div key="low" className="col" style={{ gap: 6 }}><b>Дни с просадкой</b>
      {I.lowDays.map((x) => (
        <div key={x.iso} className="col" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 6 }}>{dateRu(x.iso)} <span className="muted row" style={{ gap: 6 }}><Dia color={L(x.level)?.color} />{L(x.level)?.name}</span></div>
          {x.low.length > 0 && <div className="muted">Ниже нормы: {x.low.map((y) => `${y.name} (${y.label})`).join(', ')}</div>}
          {x.comment && <Quote text={x.comment} />}
        </div>
      ))}
    </div>);
  if (I.drops.length) parts.push(<div key="drops"><b>Резкие спады</b><div>{I.drops.map((x) => `${x.from} → ${x.to}: ${L(x.a)?.name} → ${L(x.b)?.name}`).join('; ')}</div></div>);
  if (I.lowItems.length) parts.push(<div key="li"><b>Дела с низкой оценкой</b><div>{grpLine(I.lowItems, (x) => `${x.name} ×${x.count} (${x.labels})`)}</div></div>);
  if (I.missed.length) parts.push(<div key="miss"><b>Запланировано, но не сделано</b><div>{grpLine(I.missed, (x) => x.name + (x.count > 1 ? ` ×${x.count}` : ''))}</div></div>);
  if (I.neglected.length) parts.push(<div key="neg"><b>Без внимания весь период</b><div>{I.neglected.join(' · ')}</div></div>);
  return (
    <Block title="Точки роста">
      {parts.length ? <div className="col" style={{ gap: 12, fontSize: 14 }}>{parts}</div> : <div className="muted">Явных просадок нет</div>}
    </Block>
  );
}

function DayList({ days, scale, F }: { days: RpDay[]; scale: DayState[]; F: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card flush">
      <div style={{ padding: '12px 16px 8px' }}><h2>По дням</h2></div>
      {days.slice().reverse().map((d) => {
        const st = levelState(scale, d.level), isOpen = open === d.iso;
        return (
          <div key={d.iso} style={{ borderTop: '1px solid var(--line2)' }}>
            <button type="button" className="list-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : d.iso)}>
              <span className="grow"><span style={{ fontWeight: 600 }}>{dateRu(d.iso)}</span><span className="muted">{weekday(d.iso)}</span></span>
              <span className="col" style={{ gap: 2, alignItems: 'flex-end' }}>
                {st ? <span className="row" style={{ gap: 6, fontSize: 14 }}><Dia color={d.dayColor || st.color} />{F ? 'уровень ' : ''}{st.name}</span> : <span className="muted">без оценки</span>}
                <span className="muted">{d.found ? `сделано ${d.count}` : 'нет в таблице'}</span>
              </span>
              <Icon name={isOpen ? 'up' : 'down'} size={16} stroke={2.4} />
            </button>
            {isOpen && <div className="col" style={{ gap: 12, padding: '0 16px 16px' }}><DayDetail d={d} /></div>}
          </div>
        );
      })}
    </section>
  );
}

function DayDetail({ d }: { d: RpDay }) {
  if (!d.found) return <div className="muted">В таблице нет этой даты</div>;
  const groups = doneByCat(d);
  const sm = d.summary.filter((x) => x.name !== 'День');
  const left = [...d.planned.map((x) => x.name), ...d.oneoffs.filter((o) => !o.done).map((o) => o.name)];
  return (
    <>
      {!groups.length && <div className="muted">Ничего не отмечено</div>}
      {groups.map(([c, xs]) => (
        <div key={c} className="col" style={{ gap: 4 }}>
          <div className="caps">{c}</div>
          {xs.map((x, i) => (
            <div key={i} className="col" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 8, fontSize: 14 }}>
                <Dia color={x.color} />
                <span style={{ flex: 1, minWidth: 0 }}>{x.name}{x.one && <span className="muted"> · на день</span>}</span>
                <span className="muted">{x.label}</span>
              </div>
              {x.note && <div className="muted" style={{ paddingLeft: 17 }}>{x.note}</div>}
            </div>
          ))}
        </div>
      ))}
      {sm.length > 0 && (
        <div className="col" style={{ gap: 6 }}><div className="caps">Итоги</div>
          <div className="wrap" style={{ gap: 6 }}>{sm.map((x) => <span key={x.name} className="mark"><Dia color={x.color} />{x.name}{x.label ? ` — ${x.label}` : ''}{x.note ? ` (${x.note})` : ''}</span>)}</div>
        </div>
      )}
      {d.notes.length > 0 && <div style={{ fontSize: 14 }}><span className="caps">Пометки </span>{d.notes.map((x) => `${x.name}: ${x.note}`).join('; ')}</div>}
      {left.length > 0 && <div style={{ fontSize: 14 }}><span className="caps">Не сделано из плана </span>{left.join(' · ')}</div>}
      {d.comment && <Quote text={d.comment} />}
      {(d.drawings.amp || d.drawings.pic) && <div className="muted">Есть рисунок дня — он попадёт в PDF и виден в полной версии.</div>}
    </>
  );
}
