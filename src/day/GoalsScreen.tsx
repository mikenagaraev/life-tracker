import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { moveItem, useReorder } from '../core/reorder';
import { pref } from '../core/db';
import { parseIso, todayIso } from '../core/format';
import { Icon } from '../core/icons';
import { ConfirmButton, Seg, Sheet, toast } from '../core/ui';
import {
  ST_LABEL, ST_NEXT, cmpNum, dueInfo, kids, moved, nextSteps, numbers, pathTo, scopeOf, stats, subtree, topTags, upcoming,
  type Goal, type GoalStatus,
} from './goals';
import { useGoals, useGoalsView } from './goalsStore';
import { useDay } from './store';

const dateShort = (iso: string) => {
  const d = parseIso(iso), s = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  return d.getFullYear() !== new Date().getFullYear() ? `${s} ${d.getFullYear()}` : s;
};

function readClosed(): Set<string> {
  try { return new Set(JSON.parse(pref('day:glClosed') || '[]')); } catch { return new Set(); }
}

/** «Цели»: дерево целей с подзадачами любой глубины. Правки работают и без сети. */
export function GoalsView({ dayCats }: { dayCats: string[] }) {
  const goals = useGoalsView();
  const ready = useGoals((s) => s.ready);
  const fetched = useGoals((s) => s.fetched);
  const queue = useGoals((s) => s.queue.length);
  const syncing = useGoals((s) => s.syncing);
  const error = useGoals((s) => s.error);
  const [focus, setFocusRaw] = useState<string>(() => pref('day:glFocus') || '');
  const [tagF, setTagFRaw] = useState<string>(() => pref('day:glTag') || '');
  const [stF, setStFRaw] = useState<GoalStatus | ''>(() => (pref('day:glSt') as GoalStatus) || '');
  const [closed, setClosed] = useState<Set<string>>(readClosed);
  const [edit, setEdit] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const conn = useDay((s) => s.conn);
  useEffect(() => { if (conn) void useGoals.getState().sync(); }, [conn]);

  const setFocus = (id: string) => { setFocusRaw(id); pref('day:glFocus', id); window.scrollTo(0, 0); };
  const setTagF = (t: string) => { setTagFRaw(t); pref('day:glTag', t); };
  const setStF = (s: GoalStatus | '') => { setStFRaw(s); pref('day:glSt', s); };
  const toggle = (id: string) => {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setClosed(next);
    pref('day:glClosed', JSON.stringify([...next]));
  };
  const open = (id: string) => { if (closed.has(id)) toggle(id); };

  const nums = useMemo(() => numbers(goals), [goals]);
  const tags = useMemo(() => topTags(goals), [goals]);
  const f = focus ? goals.find((g) => g.id === focus) : undefined;
  const tag = tags.includes(tagF) ? tagF : '';
  const scope = useMemo(() => scopeOf(goals, tag), [goals, tag]);
  const today = todayIso();
  const count = (s: GoalStatus) => goals.filter((g) => g.status === s).length;
  const editing = edit ? goals.find((g) => g.id === edit) : undefined;
  const suggest = useMemo(() => [...new Set([...dayCats, ...tags])], [dayCats, tags]);

  const ctx: TreeCtx = { goals, nums, closed, focus: f?.id || '', today, toggle, setFocus, setEdit };

  if (!ready || (!fetched && !goals.length && (syncing || !error))) return <div className="skeleton" style={{ height: 320 }} />;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <span className="muted">
          {f ? (() => { const st = stats(goals, f.id); return st.n ? `готово ${st.k} из ${st.n}` : ST_LABEL[f.status]; })()
            : goals.length ? `готово ${count('done')} · в процессе ${count('doing')} · to do ${count('todo')}` : ''}
        </span>
        <button type="button" className="chip" disabled={!goals.length} onClick={() => setExporting(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="lend" size={14} />Скачать</button>
      </div>
      {(queue > 0 || error) && (
        <div className="muted row" style={{ gap: 6 }}>
          <Icon name={error === 'offline' ? 'cloudOff' : syncing ? 'sync' : 'clock'} size={14} />
          {error && error !== 'offline' ? `Не отправилось: ${error}`
            : queue ? `Не отправлено правок: ${queue}${error === 'offline' ? ' — уйдут, когда появится сеть' : ''}`
            : 'Нет сети — показаны сохранённые цели'}
        </div>
      )}

      {!f ? (
        <>
          {goals.length > 0 && (
            <div className="row chip-scroll" style={{ gap: 6 }} role="group" aria-label="Фильтр целей">
              <button type="button" className={'chip' + (!tag && !stF ? ' on' : '')} onClick={() => { setTagF(''); setStF(''); }}>Все</button>
              {(['todo', 'doing', 'done'] as const).map((s) => (
                <button key={s} type="button" className={'chip' + (stF === s ? ' on' : '')} aria-pressed={stF === s} onClick={() => setStF(stF === s ? '' : s)}>{ST_LABEL[s]}</button>
              ))}
              {tags.map((t) => (
                <button key={t} type="button" className={'chip' + (tag === t ? ' on' : '')} aria-pressed={tag === t} onClick={() => setTagF(tag === t ? '' : t)}>#{t}</button>
              ))}
            </div>
          )}
          {!goals.length && <div className="card muted">Пока нет целей — добавь первую ниже.</div>}
          {goals.length > 0 && !stF && (() => {
            const up = upcoming(goals, scope);
            return up.length > 0 && (
              <Card title="Ближайшие сроки">{up.map((g) => <FlatRow key={g.id} g={g} ctx={ctx} />)}</Card>
            );
          })()}
          {goals.length > 0 && !stF && (
            <section className="card flush">
              <GoalChildren parent="" depth={0} ctx={ctx} only={tag ? (t) => t.tag === tag : undefined} />
            </section>
          )}
          {stF && (() => {
            const list = goals.filter((g) => scope.has(g.id) && g.status === stF).sort((a, b) => cmpNum(nums[a.id], nums[b.id]));
            return (
              <Card title={ST_LABEL[stF]} meta={String(list.length)}>
                {!list.length && <div className="muted" style={{ padding: '0 16px 8px' }}>Нет задач с этим статусом</div>}
                {list.map((g) => <FlatRow key={g.id} g={g} ctx={ctx} />)}
              </Card>
            );
          })()}
          <AddGoal suggest={suggest} defTag={tag} />
        </>
      ) : (
        <>
          <div className="wrap" style={{ gap: 4, alignItems: 'center' }}>
            <button type="button" className="link" style={{ minHeight: 36 }} onClick={() => setFocus('')}>← Все цели</button>
            {pathTo(goals, f.id).slice(0, -1).map((p) => (
              <span key={p.id} className="row" style={{ gap: 4 }}>
                <span className="muted">›</span>
                <button type="button" className="link" style={{ minHeight: 36, textAlign: 'left' }} onClick={() => setFocus(p.id)}>{nums[p.id]} {p.title}</button>
              </span>
            ))}
          </div>
          {(() => {
            const next = nextSteps(goals, f.id), st = stats(goals, f.id);
            return (
              <Card title="Что сделать дальше" meta={next.length ? `${next.length} шаг.` : ''}>
                {!next.length && <div className="muted" style={{ padding: '0 16px 8px' }}>{st.n ? 'Все шаги выполнены' : 'Добавь подзадачи через «⋯»'}</div>}
                {next.map((g) => <FlatRow key={g.id} g={g} ctx={ctx} />)}
              </Card>
            );
          })()}
          <section className="card flush"><Node g={f} depth={0} ctx={ctx} /></section>
        </>
      )}

      {editing && <GoalSheet g={editing} goals={goals} suggest={suggest} num={nums[editing.id]} onClose={() => setEdit(null)}
        onOpenBranch={() => open(editing.id)}
        onFocus={() => { setEdit(null); setFocus(editing.id); }}
        onDeleted={() => { setEdit(null); if (focus && subtree(goals, editing.id).has(focus)) setFocus(editing.parent); }} />}
      {exporting && <ExportSheet goals={goals} nums={nums} initial={f ? subtree(goals, f.id) : null} onClose={() => setExporting(false)} />}
    </div>
  );
}

function Card({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="card flush" style={{ paddingBottom: 6 }}>
      <div className="between" style={{ padding: '12px 16px 6px' }}><h2>{title}</h2>{meta && <span className="muted">{meta}</span>}</div>
      {children}
    </section>
  );
}

interface TreeCtx {
  goals: Goal[];
  nums: Record<string, string>;
  closed: Set<string>;
  focus: string;
  today: string;
  toggle: (id: string) => void;
  setFocus: (id: string) => void;
  setEdit: (id: string) => void;
}

function StatusBtn({ g }: { g: Goal }) {
  const setStatus = useGoals((s) => s.setStatus);
  const next = ST_NEXT[g.status];
  return (
    <button type="button" className={`gl-st ${g.status}`} aria-label={`Статус: ${ST_LABEL[g.status]}. Нажми — «${ST_LABEL[next]}»`}
      onClick={() => { setStatus(g.id, next); toast(`${g.title}: ${ST_LABEL[next]}`); }}>
      {g.status === 'done' && <Icon name="check" size={16} stroke={3} />}
    </button>
  );
}

function DueChip({ g, today }: { g: Goal; today: string }) {
  const d = dueInfo(g, today);
  return d ? <span className={`gl-due ${d.kind}`}>{d.prefix}{dateShort(g.due)}</span> : null;
}

interface DragProps { ref: (el: HTMLElement | null) => void; style?: CSSProperties; grip: ReturnType<ReturnType<typeof useReorder>['grip']> }

/** Подзадачи одного родителя: перетаскивание за ⠿ меняет порядок среди соседей (вместе с их ветками). */
function GoalChildren({ parent, depth, ctx, only }: { parent: string; depth: number; ctx: TreeCtx; only?: (g: Goal) => boolean }) {
  const reorder = useGoals((s) => s.reorder);
  const all = kids(ctx.goals, parent);
  const list = only ? all.filter(only) : all;
  const ids = list.map((g) => g.id);
  // при фильтре по тегу видны не все соседи — порядок тогда не трогаем
  const drag = useReorder(ids, (from, to) => { reorder(parent, moveItem(ids, from, to)); toast('Порядок изменён'); }, !only);
  return <>{list.map((c) => <Node key={c.id} g={c} depth={depth} ctx={ctx} drag={{ ref: drag.register(c.id), style: drag.styleFor(c.id), grip: drag.grip(c.id) }} />)}</>;
}

function Node({ g, depth, ctx, drag }: { g: Goal; depth: number; ctx: TreeCtx; drag?: DragProps }) {
  const ch = kids(ctx.goals, g.id);
  const st = stats(ctx.goals, g.id);
  const isClosed = ctx.closed.has(g.id);
  const isFocus = g.id === ctx.focus;
  return (
    <div ref={drag?.ref} style={drag?.style}>
      <div className={`gl-row ${g.status}`} style={{ paddingLeft: 2 + Math.min(depth, 6) * 18 }}>
        {drag ? <button type="button" className="grip-btn" aria-label={`Перетащить «${g.title}»`} {...drag.grip}><Icon name="grip" size={16} /></button> : <span style={{ width: 30, flex: 'none' }} />}
        {ch.length ? (
          <button type="button" className="icon-btn" style={{ width: 28, height: 36 }} aria-expanded={!isClosed} aria-label={isClosed ? 'Развернуть' : 'Свернуть'} onClick={() => ctx.toggle(g.id)}>
            <Icon name={isClosed ? 'chevRight' : 'chevDown'} size={15} stroke={2.4} />
          </button>
        ) : <span style={{ width: 28, flex: 'none' }} />}
        <StatusBtn g={g} />
        <button type="button" className="gl-main" disabled={isFocus} onClick={() => ctx.setFocus(g.id)} aria-label={isFocus ? undefined : `Открыть цепочку «${g.title}»`}>
          <span className="gl-title"><span className="gl-num">{ctx.nums[g.id]}</span>{g.title}</span>
          {(g.status === 'doing' || (!g.parent && g.tag) || g.due || st.n > 0) && (
            <span className="gl-meta">
              {g.status === 'doing' && <span style={{ color: 'var(--day)', fontWeight: 600 }}>в процессе</span>}
              {!g.parent && g.tag && <span className="gl-tag">#{g.tag}</span>}
              <DueChip g={g} today={ctx.today} />
              {st.n > 0 && <span>{st.k}/{st.n}</span>}
            </span>
          )}
        </button>
        <button type="button" className="icon-btn" style={{ width: 40 }} aria-label={`Действия: ${g.title}`} onClick={() => ctx.setEdit(g.id)}>
          <Icon name="other" size={20} />
        </button>
      </div>
      {!isClosed && ch.length > 0 && <GoalChildren parent={g.id} depth={depth + 1} ctx={ctx} />}
    </div>
  );
}

function FlatRow({ g, ctx }: { g: Goal; ctx: TreeCtx }) {
  const path = pathTo(ctx.goals, g.id).slice(0, -1).map((p) => p.title).join(' › ');
  return (
    <div className={`gl-row ${g.status}`} style={{ paddingLeft: 12 }}>
      <StatusBtn g={g} />
      <button type="button" className="gl-main" onClick={() => ctx.setFocus(g.id)} aria-label={`Открыть цепочку «${g.title}»`}>
        <span className="gl-title"><span className="gl-num">{ctx.nums[g.id]}</span>{g.title}</span>
        {(path || g.due) && <span className="gl-meta">{path && <span className="ellipsis" style={{ maxWidth: '100%' }}>{path}</span>}<DueChip g={g} today={ctx.today} /></span>}
      </button>
      <button type="button" className="icon-btn" style={{ width: 40 }} aria-label={`Действия: ${g.title}`} onClick={() => ctx.setEdit(g.id)}>
        <Icon name="other" size={20} />
      </button>
    </div>
  );
}

function AddGoal({ suggest, defTag }: { suggest: string[]; defTag: string }) {
  const add = useGoals((s) => s.add);
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('');
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    add('', t, tag.trim() || defTag);
    setTitle(''); setTag('');
    toast('Цель добавлена');
  };
  return (
    <form className="card" style={{ gap: 8 }} autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h2>Новая цель</h2>
      <input className="field" value={title} maxLength={200} placeholder="Например: создать 2-й альбом" aria-label="Новая цель" onChange={(e) => setTitle(e.target.value)} />
      <div className="inline-add">
        <input className="field" value={tag} maxLength={60} list="gl-tags" placeholder={defTag ? `Тег: ${defTag}` : 'Тег, например: Музыка'} aria-label="Тег цели" onChange={(e) => setTag(e.target.value)} />
        <button type="submit" disabled={!title.trim()}>Добавить</button>
      </div>
      <datalist id="gl-tags">{suggest.map((t) => <option key={t} value={t} />)}</datalist>
    </form>
  );
}

/* ---------- действия с целью ---------- */

function GoalSheet({ g, goals, suggest, num, onClose, onOpenBranch, onFocus, onDeleted }: {
  g: Goal; goals: Goal[]; suggest: string[]; num: string;
  onClose: () => void; onOpenBranch: () => void; onFocus: () => void; onDeleted: () => void;
}) {
  const s = useGoals.getState();
  const [title, setTitle] = useState(g.title);
  const [tag, setTag] = useState(g.tag);
  const [sub, setSub] = useState('');
  const [added, setAdded] = useState(0);
  const st = stats(goals, g.id);
  const saveTitle = () => { const t = title.trim(); if (t && t !== g.title) { s.rename(g.id, t); toast('Переименовано'); } else setTitle(g.title); };
  const saveTag = () => { const t = tag.trim(); if (t !== g.tag) { s.setTag(g.id, t); toast(t ? `Тег: ${t}` : 'Тег снят'); } };
  const addSub = () => {
    const t = sub.trim();
    if (!t) return;
    s.add(g.id, t);
    onOpenBranch();
    setSub(''); setAdded(added + 1);
  };
  const up = moved(goals, g.id, -1), down = moved(goals, g.id, 1);

  return (
    <Sheet title={`${num}. ${g.title}`} onClose={() => { saveTitle(); if (!g.parent) saveTag(); onClose(); }}>
      <label className="col" style={{ gap: 6 }}><span className="label">Название</span>
        <input className="field" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </label>
      <div className="col" style={{ gap: 6 }}><span className="label">Статус</span>
        <Seg<GoalStatus> small label="Статус цели" value={g.status} onChange={(v) => s.setStatus(g.id, v)}
          items={[{ key: 'todo', label: 'To do' }, { key: 'doing', label: 'В процессе' }, { key: 'done', label: 'Готово' }]} />
      </div>
      <div className="col" style={{ gap: 6 }}><span className="label">Срок</span>
        <div className="row" style={{ gap: 8 }}>
          <input className="field" type="date" value={g.due} aria-label="Срок" style={{ flex: 1 }}
            onChange={(e) => { const v = e.target.value; if (!v || /^(20\d\d|2100)-\d\d-\d\d$/.test(v)) s.setDue(g.id, v); }} />
          {g.due && <button type="button" className="chip" onClick={() => s.setDue(g.id, '')}>Убрать</button>}
        </div>
      </div>
      {!g.parent && (
        <label className="col" style={{ gap: 6 }}><span className="label">Тег</span>
          <input className="field" value={tag} maxLength={60} list="gl-tags-sheet" placeholder="Например: Музыка" onChange={(e) => setTag(e.target.value)} onBlur={saveTag}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          <datalist id="gl-tags-sheet">{suggest.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
      )}
      <div className="col" style={{ gap: 6 }}><span className="label">Подзадача{added ? ` · добавлено ${added}` : ''}</span>
        <div className="inline-add">
          <input className="field" value={sub} maxLength={200} placeholder="Новая подзадача" aria-label="Новая подзадача" onChange={(e) => setSub(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }} />
          <button type="button" disabled={!sub.trim()} onClick={addSub}>Добавить</button>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="secondary" style={{ flex: 1 }} disabled={!up} onClick={() => s.move(g.id, -1)}>↑ Выше</button>
        <button type="button" className="secondary" style={{ flex: 1 }} disabled={!down} onClick={() => s.move(g.id, 1)}>↓ Ниже</button>
      </div>
      <button type="button" className="secondary" onClick={onFocus}>Открыть цепочку</button>
      <ConfirmButton className="secondary danger" onConfirm={() => { s.remove(g.id); toast('Удалено'); onDeleted(); }}>
        {st.n ? `Удалить вместе с подзадачами (${st.n})` : 'Удалить цель'}
      </ConfirmButton>
    </Sheet>
  );
}

/* ---------- выгрузка PDF / TXT ---------- */

function ExportSheet({ goals, nums, initial, onClose }: { goals: Goal[]; nums: Record<string, string>; initial: Set<string> | null; onClose: () => void }) {
  const exportFile = useGoals((s) => s.exportFile);
  const net = useDay((s) => s.net);
  const [sel, setSel] = useState<Set<string>>(() => initial || new Set(goals.map((g) => g.id)));
  const [fmt, setFmt] = useState<'pdf' | 'txt'>('pdf');
  const [withDone, setWithDone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ name: string; url: string; download: string; b64: string; type: string } | null>(null);

  const flip = (id: string, on: boolean) => {
    const next = new Set(sel);
    subtree(goals, id).forEach((x) => (on ? next.add(x) : next.delete(x)));
    setSel(next); setRes(null);
  };
  const rows: { g: Goal; depth: number }[] = [];
  const walk = (p: string, d: number) => kids(goals, p).forEach((g) => { rows.push({ g, depth: d }); walk(g.id, d + 1); });
  walk('', 0);

  async function go() {
    setBusy(true);
    try { setRes(await exportFile([...sel], fmt, withDone)); } catch (e) { toast('Не получилось: ' + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  }
  function share() {
    if (!res) return;
    try {
      const bin = atob(res.b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const f = new File([u8], res.name, { type: res.type });
      if (!navigator.canShare({ files: [f] })) throw new Error('no');
      navigator.share({ files: [f], title: res.name }).catch((err) => { if (err?.name !== 'AbortError') toast('Не получилось — нажми «Скачать»'); });
    } catch { toast('Этот браузер не умеет отправлять файлы — нажми «Скачать»'); }
  }
  const canShare = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

  return (
    <Sheet title="Скачать цели" onClose={onClose}>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <button type="button" className="link" style={{ minHeight: 32 }} onClick={() => { setSel(new Set(goals.map((g) => g.id))); setRes(null); }}>Выбрать всё</button>
        <button type="button" className="link" style={{ minHeight: 32 }} onClick={() => { setSel(new Set()); setRes(null); }}>Снять всё</button>
        <label className="row" style={{ gap: 6, fontSize: 14 }}><input type="checkbox" checked={withDone} onChange={(e) => { setWithDone(e.target.checked); setRes(null); }} />с выполненными</label>
      </div>
      <div className="col" style={{ gap: 0, maxHeight: '40dvh', overflowY: 'auto', border: '1px solid var(--line2)', borderRadius: 14, padding: '4px 0' }}>
        {rows.map(({ g, depth }) => (
          <label key={g.id} className="row" style={{ gap: 8, minHeight: 40, padding: `0 12px 0 ${12 + Math.min(depth, 6) * 18}px`, fontSize: 14, color: g.status === 'done' ? 'var(--faint)' : undefined }}>
            <input type="checkbox" checked={sel.has(g.id)} onChange={(e) => flip(g.id, e.target.checked)} />
            <span className="gl-num">{nums[g.id]}</span>
            <span style={{ flex: 1, minWidth: 0, textDecoration: g.status === 'done' ? 'line-through' : undefined }}>{g.title}</span>
          </label>
        ))}
      </div>
      <Seg<'pdf' | 'txt'> small label="Формат" value={fmt} onChange={(v) => { setFmt(v); setRes(null); }} items={[{ key: 'pdf', label: 'PDF' }, { key: 'txt', label: 'TXT' }]} />
      {res ? (
        <div className="col" style={{ gap: 8, padding: 12, borderRadius: 14, background: 'var(--ok-bg)' }}>
          <div style={{ color: 'var(--ok)', fontWeight: 600, fontSize: 14 }}>Файл готов · {res.name}</div>
          <div className="wrap" style={{ gap: 6 }}>
            {canShare && <button type="button" className="chip on" onClick={share}>Поделиться…</button>}
            <a className="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={res.download} target="_blank" rel="noreferrer">Скачать</a>
            <a className="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={res.url} target="_blank" rel="noreferrer">В Google Диске</a>
          </div>
          <div className="muted">Файл сохранён в папке «Трекер дня — отчёты» на Google Диске.</div>
        </div>
      ) : (
        <button type="button" className="primary" disabled={!sel.size || busy || net === 'offline'} onClick={go}>
          {busy ? 'Готовлю файл…' : net === 'offline' ? 'Нужен интернет' : `Скачать ${fmt.toUpperCase()}`}
        </button>
      )}
    </Sheet>
  );
}
