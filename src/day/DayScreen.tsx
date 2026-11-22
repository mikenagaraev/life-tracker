import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { readConnFromHash, type Conn } from '../core/api';
import { addDays, dayLabel, todayIso } from '../core/format';
import { Icon } from '../core/icons';
import { pref } from '../core/db';
import { ConfirmButton, Seg, Sheet, toast } from '../core/ui';
import { ChartsView } from './Charts';
import { GoalsView } from './GoalsScreen';
import { ReportView } from './Report';
import { PLAN, buildModel, catCounts, norm, progress, searchItems, stateOf, type Category } from './logic';
import { DayEditor } from './DayEditor';
import { useDay } from './store';
import type { DayData, DayItem, DayState, OneOff } from './types';

/** Текущая версия трекера дня (Apps Script): цели и рисунки пока там. */
export const DAY_TRACKER_URL = 'https://script.google.com/macros/s/AKfycbw0IPwXuvJGYYixIl4ng-aeE363tKm1RXZ9RFVXRr434U3RTCu3Or0zX07cxkKA5aAm/exec';

const DAY_VARS = { '--acc': 'var(--day)', '--acc-soft': 'var(--day-soft)' } as CSSProperties;

export function useDayView(): DayData | null {
  const days = useDay((s) => s.days);
  const queue = useDay((s) => s.queue);
  const iso = useDay((s) => s.iso);
  return useMemo(() => useDay.getState().view(iso), [days, queue, iso]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function DayStatus({ onSetup }: { onSetup?: () => void }) {
  const net = useDay((s) => s.net);
  const n = useDay((s) => s.queue.length);
  const error = useDay((s) => s.error);
  const sync = useDay((s) => s.sync);
  let cls = '', icon = 'cloud', text = 'Сохранено';
  if (net === 'setup') { cls = 'warn'; icon = 'alert'; text = 'Подключить'; }
  else if (net === 'auth') { cls = 'err'; icon = 'alert'; text = 'Неверный ключ'; }
  else if (net === 'offline') { cls = 'warn'; icon = 'cloudOff'; text = n ? `Офлайн · ${n} ждут` : 'Офлайн'; }
  else if (net === 'error') { cls = 'err'; icon = 'alert'; text = n ? `Ошибка · ${n} ждут` : 'Ошибка связи'; }
  else if (net === 'syncing') { cls = 'sync'; icon = 'sync'; text = n ? `Отправляю · ${n}` : 'Обновляю'; }
  else if (n) { cls = 'warn'; icon = 'clock'; text = `${n} ждут отправки`; }
  return (
    <button type="button" className={'status ' + cls} title={error || undefined}
      onClick={() => (net === 'setup' || net === 'auth' ? onSetup?.() : void sync(true))}>
      <Icon name={icon} size={16} />{text}
    </button>
  );
}

/** Палитра состояний + «В планы» + «Очистить». */
function Swatches({ current, states, onPick, oneoff }: { current: string; states: DayState[]; onPick: (c: string) => void; oneoff?: boolean }) {
  const cur = norm(current);
  return (
    <div role="radiogroup" aria-label="Состояние" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, padding: '4px 12px 14px' }}>
      {states.map((s) => (
        <button key={s.color} type="button" role="radio" aria-checked={cur === s.color} onClick={() => onPick(s.color)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px', borderRadius: 12, background: 'var(--card)', border: `1.5px solid ${cur === s.color ? 'var(--ink)' : 'var(--line2)'}` }}>
          <span style={{ width: 22, height: 22, borderRadius: 11, background: s.color, border: '1px solid rgba(18,22,28,.2)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.15, textAlign: 'center' }}>{s.name}</span>
        </button>
      ))}
      <button type="button" role="radio" aria-checked={cur === PLAN} onClick={() => onPick(PLAN)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px', borderRadius: 12, background: 'var(--card)', border: `1.5px solid ${cur === PLAN ? 'var(--ink)' : 'var(--line2)'}` }}>
        <span style={{ width: 22, height: 22, borderRadius: 11, background: PLAN, border: '1px solid rgba(18,22,28,.2)' }} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>В планы</span>
      </button>
      <button type="button" onClick={() => onPick('')}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px', borderRadius: 12, background: 'var(--card)', border: '1.5px dashed var(--dash)' }}>
        <Icon name="close" size={22} stroke={1.8} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>{oneoff ? 'Вернуть в планы' : 'Очистить'}</span>
      </button>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  const c = norm(color);
  return <span style={{ width: 18, height: 18, borderRadius: 9, flex: 'none', boxSizing: 'border-box', background: c || 'var(--card)', border: c ? '1px solid rgba(18,22,28,.2)' : '1.5px solid var(--dash)' }} />;
}

function ItemRow({ name, color, states, open, onToggle, onPick, oneoff, onDelete, highlight }: {
  name: string; color: string; states: DayState[]; open: boolean; onToggle: () => void; onPick: (c: string) => void;
  oneoff?: boolean; onDelete?: () => void; highlight?: boolean;
}) {
  const st = stateOf(color, states);
  return (
    <div style={{ borderTop: '1px solid var(--line2)', background: highlight ? 'var(--day-soft)' : undefined }}>
      <div className="row" style={{ gap: 0 }}>
        <button type="button" aria-expanded={open} onClick={onToggle} className="list-row" style={{ borderTop: 0, flex: 1, minHeight: 52 }}>
          <Dot color={color} />
          <span className="grow"><span style={{ fontSize: 15, fontWeight: 500 }}>{name}</span>{oneoff && <span className="muted" style={{ fontSize: 12 }}>разовое</span>}</span>
          <span className="muted">{st ? st.name : 'не отмечено'}</span>
        </button>
        {onDelete && open && (
          <ConfirmButton className="link danger" onConfirm={onDelete}><span style={{ padding: '0 12px' }}>Удалить</span></ConfirmButton>
        )}
      </div>
      {open && <Swatches current={color} states={states} oneoff={oneoff} onPick={onPick} />}
    </div>
  );
}

function ColorStrip({ colors }: { colors: string[] }) {
  if (!colors.length) return <div className="bar-track" />;
  // Сначала отмеченные (в порядке дел), потом пустые — читается как прогресс с цветами состояний.
  const sorted = [...colors.filter(Boolean), ...colors.filter((c) => !c)];
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
      {sorted.map((c, i) => <span key={i} style={{ flex: 1, background: c || 'var(--line2)' }} />)}
    </div>
  );
}

function AddOneOff({ cat }: { cat: string }) {
  const add = useDay((s) => s.addOneOff);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) return <button type="button" className="add-pill" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>+ Разовое дело</button>;
  const ok = () => { if (!text.trim()) return setOpen(false); add(text, cat); setText(''); setOpen(false); toast('✓ Добавлено в планы'); };
  return (
    <div className="inline-add">
      <label className="sr" htmlFor={`one-${cat}`}>Разовое дело</label>
      <input id={`one-${cat}`} className="field" autoFocus value={text} placeholder="Что сделать" maxLength={200}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') setOpen(false); }} />
      <button type="button" onClick={ok}>Добавить</button>
    </div>
  );
}

function CategoryCard({ cat, states, focusRow }: { cat: Category; states: DayState[]; focusRow?: number | null }) {
  const setColor = useDay((s) => s.setColor);
  const setOneOffColor = useDay((s) => s.setOneOffColor);
  const deleteOneOff = useDay((s) => s.deleteOneOff);
  const [open, setOpen] = useState<string | null>(focusRow ? `r${focusRow}` : null);
  const groups: { sub: string; items: DayItem[] }[] = [];
  for (const it of cat.items) {
    const g = groups[groups.length - 1];
    if (g && g.sub === it.sub) g.items.push(it);
    else groups.push({ sub: it.sub, items: [it] });
  }
  const c = catCounts(cat, states);
  const pick = (key: string, fn: () => void) => { fn(); setOpen(null); void key; };
  return (
    <section className="card flush" style={{ paddingBottom: 8 }}>
      <div className="between" style={{ padding: '12px 16px 8px' }}>
        <h2>{cat.name}</h2>
        <span className="muted">{c.done} из {c.total}</span>
      </div>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.sub && <div className="caps" style={{ padding: '10px 16px 4px' }}>{g.sub}</div>}
          {g.items.map((it) => (
            <ItemRow key={`${it.row}-${it.name}`} name={it.name} color={it.color} states={states} open={open === `r${it.row}`}
              highlight={focusRow === it.row}
              onToggle={() => setOpen(open === `r${it.row}` ? null : `r${it.row}`)}
              onPick={(col) => pick(`r${it.row}`, () => setColor(it, col))} />
          ))}
        </div>
      ))}
      {cat.oneoffs.map((o) => (
        <ItemRow key={o.id} name={o.name} color={o.color} states={states} oneoff open={open === o.id}
          onToggle={() => setOpen(open === o.id ? null : o.id)}
          onPick={(col) => pick(o.id, () => setOneOffColor(o, col))}
          onDelete={() => { deleteOneOff(o); setOpen(null); toast('Удалено'); }} />
      ))}
      <div style={{ padding: '10px 16px 4px', borderTop: '1px solid var(--line2)' }}><AddOneOff cat={cat.name} /></div>
    </section>
  );
}

function Comment({ iso, value }: { iso: string; value: string }) {
  const setComment = useDay((s) => s.setComment);
  const [text, setText] = useState(value);
  const saved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { setText(value); saved.current = value; }, [iso, value]);
  const flush = (v: string) => { clearTimeout(timer.current); if (v.trim() !== saved.current.trim()) { saved.current = v; setComment(v); } };
  return (
    <section className="card">
      <label className="label" htmlFor="daynote" style={{ font: '700 17px var(--head)', color: 'var(--ink)' }}>Комментарий к дню</label>
      <textarea id="daynote" className="field" rows={3} placeholder="Как прошёл день?" value={text}
        onChange={(e) => { setText(e.target.value); clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => flush(v), 1500); }}
        onBlur={(e) => flush(e.target.value)} />
    </section>
  );
}

type Section = 'day' | 'report' | 'charts' | 'goals';
type View = { kind: 'overview' } | { kind: 'cat'; name: string; focus?: number } | { kind: 'plan' } | { kind: 'edit' };

export function DayScreen({ onSettings }: { onSettings: () => void }) {
  const iso = useDay((s) => s.iso);
  const setIso = useDay((s) => s.setIso);
  const ready = useDay((s) => s.ready);
  const net = useDay((s) => s.net);
  const conn = useDay((s) => s.conn);
  const setColor = useDay((s) => s.setColor);
  const setOneOffColor = useDay((s) => s.setOneOffColor);
  const day = useDayView();
  const [view, setView] = useState<View>({ kind: 'overview' });
  const [section, setSectionRaw] = useState<Section>(() => (pref('day:section') as Section) || 'day');
  const setSection = (v: Section) => { setSectionRaw(v); pref('day:section', v); };
  const [q, setQ] = useState('');
  const [openSolo, setOpenSolo] = useState<number | null>(null);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const states = day?.states?.length ? day.states : useDay.getState().states;
  const model = useMemo(() => (day ? buildModel(day) : null), [day]);
  const prog = model ? progress(model, states) : { done: 0, total: 0 };
  const today = todayIso();
  const planned = useMemo(() => {
    if (!model) return [] as { cat: string; item?: DayItem; one?: OneOff }[];
    const out: { cat: string; item?: DayItem; one?: OneOff }[] = [];
    for (const c of model.cats) {
      for (const it of c.items) if (it.planned || norm(it.color) === PLAN) out.push({ cat: c.name, item: it });
      for (const o of c.oneoffs) out.push({ cat: c.name, one: o }); // разовые всегда в планах дня
    }
    for (const o of model.looseOneoffs) out.push({ cat: o.cat, one: o });
    return out;
  }, [model]);
  const found = model && q ? searchItems(model, q) : [];

  const go = (d: string) => { setIso(d); setOpenSolo(null); setOpenPlan(null); };

  if (!conn && net === 'setup') return <DaySetup />;

  const cat = view.kind === 'cat' ? model?.cats.find((c) => c.name === view.name) : undefined;
  const catIdx = cat && model ? model.cats.indexOf(cat) : -1;

  return (
    <div className="col" style={{ ...DAY_VARS, gap: 14 }}>
      <div className="between">
        <h1>День</h1>
        <div className="row" style={{ gap: 4 }}>
          <DayStatus onSetup={onSettings} />
          <button type="button" className="icon-btn" aria-label="Настройки" onClick={onSettings}><Icon name="gear" /></button>
        </div>
      </div>

      <Seg<Section> small label="Раздел трекера дня" value={section} onChange={setSection}
        items={[{ key: 'day', label: 'День' }, { key: 'report', label: 'Сводка' }, { key: 'charts', label: 'Графики' }, { key: 'goals', label: 'Цели' }]} />

      {section !== 'goals' && <div className="row" style={{ gap: 6 }}>
        <button type="button" className="icon-btn filled" aria-label="Предыдущий день" onClick={() => go(addDays(iso, -1))}><Icon name="chevLeft" /></button>
        <button type="button" className="pill" style={{ flex: 1, justifyContent: 'center', position: 'relative' }} onClick={() => dateRef.current?.showPicker?.()}>
          {dayLabel(iso)}
          <input ref={dateRef} type="date" value={iso} aria-label="Выбрать дату" onChange={(e) => e.target.value && go(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
        </button>
        <button type="button" className="icon-btn filled" aria-label="Следующий день" onClick={() => go(addDays(iso, 1))}><Icon name="chevRight" /></button>
        {iso !== today && <button type="button" className="pill" style={{ background: 'var(--day)', color: '#fff', border: 0 }} onClick={() => go(today)}>Сегодня</button>}
      </div>}

      {section === 'day' && <div className="col" style={{ gap: 6 }}>
        <div className="bar-track" style={{ background: 'var(--seg)' }}>
          <div className="bar-fill" style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%`, background: 'var(--day)' }} />
        </div>
        <div className="muted">{day ? `Отмечено ${prog.done} из ${prog.total}` : ready ? 'Загружаю день…' : ''}</div>
      </div>}

      {section === 'day' && net === 'offline' && (
        <div className="banner" role="status"><Icon name="cloudOff" size={22} />
          <div><b>Нет интернета — отмечай как обычно</b>Отметки сохранятся на телефоне и уйдут в таблицу, когда появится сеть.</div>
        </div>
      )}
      {section === 'day' && day && !day.found && (
        <div className="banner err"><Icon name="alert" size={22} /><div><b>В таблице нет столбца для этой даты</b>Отметить этот день пока нельзя.</div></div>
      )}

      {section === 'report' && <ReportView iso={iso} allCats={model?.cats.map((c) => c.name) || []} />}
      {section === 'goals' && <GoalsView dayCats={model?.cats.map((c) => c.name) || []} />}
      {section === 'charts' && (model ? <ChartsView model={model} day={day} states={states} /> : <div className="skeleton" style={{ height: 240 }} />)}

      {section === 'day' && !day && <div className="skeleton" style={{ height: 320 }} />}

      {section === 'day' && model && (
        <>
          <label className="row field" style={{ padding: '0 12px', height: 44 }}>
            <Icon name="search" size={18} /><span className="sr">Найти дело</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти дело"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontSize: 16 }} />
          </label>
          {q && (
            <div className="card flush">
              {!found.length && <div className="muted" style={{ padding: 16 }}>Ничего не нашлось</div>}
              {found.map(({ cat: c, item }) => (
                <button key={item.row} type="button" className="list-row" onClick={() => { setView({ kind: 'cat', name: c, focus: item.row }); setQ(''); }}>
                  <Dot color={item.color} /><span className="grow"><span>{item.name}</span><span className="muted">{c}</span></span>
                </button>
              ))}
            </div>
          )}

          <div className="row chip-scroll" style={{ gap: 6 }} role="group" aria-label="Разделы дня">
            <button type="button" className={'chip' + (view.kind === 'overview' ? ' on' : '')} onClick={() => setView({ kind: 'overview' })}>Обзор</button>
            <button type="button" className={'chip' + (view.kind === 'edit' ? ' on' : '')} onClick={() => setView({ kind: 'edit' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="pencil" size={14} />Изменить</button>
            {planned.length > 0 && <button type="button" className={'chip' + (view.kind === 'plan' ? ' on' : '')} onClick={() => setView({ kind: 'plan' })}>В планах · {planned.filter((p) => norm(p.item?.color ?? p.one?.color) === PLAN).length}</button>}
            {model.cats.map((c) => {
              const k = catCounts(c, states);
              const on = view.kind === 'cat' && view.name === c.name;
              return <button key={c.name} type="button" className={'chip' + (on ? ' on' : '')} onClick={() => setView({ kind: 'cat', name: c.name })}>{c.name} <span style={{ opacity: .7, fontWeight: 500 }}>{k.done}/{k.total}</span></button>;
            })}
          </div>

          {view.kind === 'overview' && (
            <>
              <section className="card flush">
                {model.cats.map((c) => {
                  const k = catCounts(c, states);
                  return (
                    <button key={c.name} type="button" className="list-row" onClick={() => setView({ kind: 'cat', name: c.name })} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                      <span className="between"><b style={{ fontWeight: 600 }}>{c.name}</b><span className="muted">{k.done} из {k.total}{k.planned ? ` · в планах ${k.planned}` : ''}</span></span>
                      <ColorStrip colors={k.colors} />
                    </button>
                  );
                })}
              </section>
              {model.solos.length > 0 && (
                <section className="card flush" style={{ paddingBottom: 4 }}>
                  <div style={{ padding: '12px 16px 8px' }}><h2>Итоги дня</h2></div>
                  {model.solos.map((it) => (
                    <ItemRow key={it.row} name={it.name} color={it.color} states={states} open={openSolo === it.row}
                      onToggle={() => setOpenSolo(openSolo === it.row ? null : it.row)}
                      onPick={(col) => { setColor(it, col); setOpenSolo(null); }} />
                  ))}
                </section>
              )}
              {model.looseOneoffs.length > 0 && (
                <section className="card flush">
                  <div style={{ padding: '12px 16px 8px' }}><h2>Разовые без категории</h2></div>
                  {model.looseOneoffs.map((o) => (
                    <ItemRow key={o.id} name={o.name} color={o.color} states={states} oneoff open={openSolo === -1 && openPlan === o.id}
                      onToggle={() => { setOpenSolo(-1); setOpenPlan(openPlan === o.id ? null : o.id); }}
                      onPick={(col) => { setOneOffColor(o, col); setOpenPlan(null); }} />
                  ))}
                </section>
              )}
              <Comment iso={iso} value={day!.comment} />
            </>
          )}

          {view.kind === 'cat' && cat && (
            <>
              <CategoryCard key={`${iso}-${cat.name}-${view.focus || ''}`} cat={cat} states={states} focusRow={view.focus} />
              <div className="between">
                <button type="button" className="link" disabled={catIdx <= 0} onClick={() => setView({ kind: 'cat', name: model.cats[catIdx - 1].name })}>‹ {model.cats[catIdx - 1]?.name || ''}</button>
                <button type="button" className="link" disabled={catIdx >= model.cats.length - 1} onClick={() => setView({ kind: 'cat', name: model.cats[catIdx + 1].name })}>{model.cats[catIdx + 1]?.name || ''} ›</button>
              </div>
            </>
          )}

          {view.kind === 'edit' && <DayEditor model={model} />}

          {view.kind === 'plan' && (
            <section className="card flush" style={{ paddingBottom: 4 }}>
              <div style={{ padding: '12px 16px 8px' }}><h2>В планах на {dayLabel(iso).toLowerCase()}</h2></div>
              {planned.map((p) => {
                const key = p.item ? `r${p.item.row}` : p.one!.id;
                const color = p.item ? p.item.color : p.one!.color;
                return (
                  <ItemRow key={key} name={`${p.item ? p.item.name : p.one!.name}`} color={color} states={states} oneoff={!!p.one}
                    open={openPlan === key} onToggle={() => setOpenPlan(openPlan === key ? null : key)}
                    onPick={(col) => { if (p.item) setColor(p.item, col); else setOneOffColor(p.one!, col); setOpenPlan(null); }} />
                );
              })}
              <div className="muted" style={{ padding: '8px 16px' }}>Отмеченное из планов остаётся здесь — по нему видно, что было запланировано.</div>
            </section>
          )}
        </>
      )}

      <a className="secondary" href={DAY_TRACKER_URL} target="_blank" rel="noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)' }}>
        Полная версия трекера <Icon name="external" size={16} />
      </a>
    </div>
  );
}

/** Подключение трекера дня: ссылка-приглашение (#dk=…&du=…) или адрес + ключ. */
export function DayConnectForm({ onDone }: { onDone?: () => void }) {
  const conn = useDay((s) => s.conn);
  const setConn = useDay((s) => s.setConn);
  const net = useDay((s) => s.net);
  const error = useDay((s) => s.error);
  const [url, setUrl] = useState(conn?.url || '');
  const [token, setToken] = useState(conn?.token || '');
  const [busy, setBusy] = useState(false);
  async function connect() {
    let c: Conn = { url: url.trim(), token: token.trim() };
    if (c.url.includes('#')) {
      const l = readConnFromHash(c.url, 'd');
      if (l?.url && l.token) c = { url: l.url, token: l.token };
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(c.url)) return toast('Вставь ссылку-приглашение или адрес вида https://script.google.com/macros/s/…/exec');
    if (!c.token) return toast('Вставь ключ');
    setBusy(true);
    await setConn(c);
    setBusy(false);
    if (useDay.getState().net === 'idle') { toast('✓ Трекер дня подключён'); onDone?.(); }
  }
  return (
    <div className="col" style={{ gap: 12, ...DAY_VARS }}>
      <label className="col" style={{ gap: 6 }}>
        <span className="label">Ссылка-приглашение или адрес скрипта</span>
        <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Вставь ссылку-приглашение" autoCapitalize="off" autoCorrect="off" />
      </label>
      <label className="col" style={{ gap: 6 }}>
        <span className="label">Ключ (не нужен, если вставил приглашение)</span>
        <input className="field" value={token} onChange={(e) => setToken(e.target.value)} type="password" autoCapitalize="off" autoCorrect="off" />
      </label>
      {(net === 'auth' || net === 'error') && error && <div className="banner err"><Icon name="alert" size={20} /><div>{error}</div></div>}
      <button type="button" className="primary" disabled={busy} onClick={connect}>{busy ? 'Проверяю…' : 'Подключить'}</button>
    </div>
  );
}

function DaySetup() {
  return (
    <div className="col" style={{ gap: 20, ...DAY_VARS }}>
      <div className="col" style={{ gap: 12, padding: '12px 4px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--day)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <Icon name="check" size={30} stroke={2.4} />
        </div>
        <h1 style={{ fontSize: 30 }}>Трекер дня</h1>
        <p className="muted" style={{ fontSize: 15, margin: 0, lineHeight: 1.45 }}>
          Отмечай дела цветом состояния — отметки пишутся в твою таблицу «2026 Календарь + задачи». Без интернета тоже работает.
        </p>
      </div>
      <div className="card"><h2>Подключить таблицу</h2><DayConnectForm /></div>
      <a className="secondary" href={DAY_TRACKER_URL} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)' }}>
        Открыть текущую версию <Icon name="external" size={16} />
      </a>
    </div>
  );
}

export function DaySettingsSheet({ onClose }: { onClose: () => void }) {
  const lastSync = useDay((s) => s.lastSync);
  const n = useDay((s) => s.queue.length);
  const sync = useDay((s) => s.sync);
  return (
    <Sheet title="Трекер дня" full onClose={onClose}>
      <div className="card">
        <h2>Таблица</h2>
        <div className="muted">
          «2026 Календарь + задачи».{' '}
          {lastSync ? `Последнее обновление: ${new Date(lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : ''}
          {n ? ` Ждут отправки: ${n}.` : ''}
        </div>
        <button type="button" className="secondary" onClick={() => void sync(true)}>Обновить сейчас</button>
      </div>
      <div className="card"><h2>Подключение</h2><DayConnectForm onDone={onClose} /></div>
    </Sheet>
  );
}
