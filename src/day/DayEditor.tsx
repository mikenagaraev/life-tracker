import { useState } from 'react';
import { Icon } from '../core/icons';
import { ConfirmButton, toast } from '../core/ui';
import { PLAN, SKIP, categoryMoveTarget, droppedColors, itemMoveTarget, validateStates, type DayModel } from './logic';
import type { DayState } from './types';
import { useDay, type StructOp } from './store';

/** Поле ввода с кнопкой: Enter — сохранить, Esc — отмена. */
function InlineInput({ initial = '', placeholder, onSave, onCancel, label }: {
  initial?: string; placeholder: string; onSave: (v: string) => void; onCancel: () => void; label: string;
}) {
  const [v, setV] = useState(initial);
  const ok = () => { const t = v.trim(); if (!t || t === initial) onCancel(); else onSave(t); };
  return (
    <div className="inline-add" style={{ flex: 1, padding: '6px 0' }}>
      <input className="field" autoFocus value={v} placeholder={placeholder} aria-label={label} maxLength={120}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') onCancel(); }} />
      <button type="button" onClick={ok}>OK</button>
    </div>
  );
}

function MoveButtons({ name, up, down, disabled, onMove }: { name: string; up: number | null; down: number | null; disabled: boolean; onMove: (before: number) => void }) {
  return (
    <>
      <button type="button" className="icon-btn" style={{ width: 36 }} disabled={disabled || up === null} aria-label={`Выше: ${name}`} onClick={() => up !== null && onMove(up)}>
        <Icon name="up" size={18} />
      </button>
      <button type="button" className="icon-btn" style={{ width: 36 }} disabled={disabled || down === null} aria-label={`Ниже: ${name}`} onClick={() => down !== null && onMove(down)}>
        <Icon name="down" size={18} />
      </button>
    </>
  );
}

/** «Дела и категории»: добавить, переименовать, поменять порядок; итоги дня. Только онлайн. */
export function DayEditor({ model }: { model: DayModel }) {
  const structure = useDay((s) => s.structure);
  const net = useDay((s) => s.net);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null); // 'cat:<row>' | 'item:<row>' | 'add:<catRow>' | 'newcat' | 'newsolo'
  const offline = net === 'offline';

  async function run(op: StructOp, args: (string | number)[], after?: () => void) {
    setBusy(true);
    const ok = await structure(op, args);
    setBusy(false);
    setEdit(null);
    if (ok) after?.();
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {offline && (
        <div className="banner" role="status"><Icon name="cloudOff" size={22} />
          <div><b>Нужен интернет</b>Дела и категории меняются только онлайн: при этом сдвигаются строки таблицы.</div>
        </div>
      )}
      {busy && <div className="banner" role="status" style={{ background: 'var(--exp-soft)', borderColor: 'transparent', color: 'var(--ink)' }}><Icon name="sync" size={20} /><div>Сохраняю в таблицу…</div></div>}

      <section className="card flush">
        {model.cats.map((c, ci) => {
          const isOpen = open === c.name;
          return (
            <div key={c.row} style={{ borderTop: ci ? '1px solid var(--line2)' : 0 }}>
              <div className="row" style={{ gap: 2, padding: '4px 6px 4px 8px', minHeight: 52 }}>
                {edit === `cat:${c.row}` ? (
                  <InlineInput initial={c.name} placeholder="Название категории" label="Новое название категории"
                    onCancel={() => setEdit(null)} onSave={(v) => run('renameCategory', [c.row, c.name, v], () => setOpen(v))} />
                ) : (
                  <>
                    <button type="button" className="icon-btn" style={{ width: 32 }} aria-expanded={isOpen} aria-label={isOpen ? 'Свернуть' : 'Развернуть'} onClick={() => setOpen(isOpen ? null : c.name)}>
                      <Icon name={isOpen ? 'chevDown' : 'chevRight'} size={16} stroke={2.4} />
                    </button>
                    <button type="button" className="tree-name" style={{ fontWeight: 700 }} disabled={busy || offline} onClick={() => setEdit(`cat:${c.row}`)}>
                      {c.name} <span className="muted" style={{ fontWeight: 500 }}>· {c.items.length}</span>
                    </button>
                    <MoveButtons name={c.name} disabled={busy || offline}
                      up={categoryMoveTarget(model, ci, -1)} down={categoryMoveTarget(model, ci, 1)}
                      onMove={(before) => run('moveCategory', [c.row, c.name, before])} />
                  </>
                )}
              </div>
              {isOpen && (
                <div style={{ paddingBottom: 8 }}>
                  {c.items.map((it, ii) => (
                    <div key={it.row} className="row" style={{ gap: 2, padding: '0 6px 0 44px', minHeight: 46, borderTop: '1px solid var(--line2)' }}>
                      {edit === `item:${it.row}` ? (
                        <InlineInput initial={it.name} placeholder="Название дела" label="Новое название дела"
                          onCancel={() => setEdit(null)} onSave={(v) => run('renameTask', [it.row, it.name, v])} />
                      ) : (
                        <>
                          <button type="button" className="tree-name" disabled={busy || offline} onClick={() => setEdit(`item:${it.row}`)}>
                            {it.name}{it.sub ? <span className="muted"> · {it.sub}</span> : null}
                          </button>
                          <MoveButtons name={it.name} disabled={busy || offline}
                            up={itemMoveTarget(c, ii, -1)} down={itemMoveTarget(c, ii, 1)}
                            onMove={(before) => run('moveRow', [it.row, it.name, before])} />
                        </>
                      )}
                    </div>
                  ))}
                  <div style={{ padding: '8px 16px 0 44px' }}>
                    {edit === `add:${c.row}` ? (
                      <InlineInput placeholder="Новое дело" label={`Новое дело в «${c.name}»`}
                        onCancel={() => setEdit(null)} onSave={(v) => run('addTask', [c.row, v])} />
                    ) : (
                      <button type="button" className="add-pill" disabled={busy || offline} onClick={() => setEdit(`add:${c.row}`)}>+ Дело в «{c.name}»</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {edit === 'newcat' ? (
        <div className="card"><InlineInput placeholder="Новая категория" label="Название новой категории" onCancel={() => setEdit(null)}
          onSave={(v) => run('addCategory', [v], () => setOpen(v))} /></div>
      ) : (
        <button type="button" className="primary" style={{ background: 'var(--ink)', color: 'var(--bg)' }} disabled={busy || offline} onClick={() => setEdit('newcat')}>
          + Новая категория
        </button>
      )}

      <section className="card flush" style={{ paddingBottom: 8 }}>
        <div style={{ padding: '12px 16px 6px' }}><h2>Итоги дня</h2></div>
        {model.solos.map((s) => (
          <div key={s.row} className="row" style={{ gap: 2, padding: '0 6px 0 16px', minHeight: 46, borderTop: '1px solid var(--line2)' }}>
            <span className="tree-name" style={{ cursor: 'default' }}>{s.name}</span>
            {s.name !== 'День' && (
              <ConfirmButton className="link danger" onConfirm={() => run('removeSummaryItem', [s.row, s.name])}>
                <span style={{ padding: '0 10px' }}>Убрать</span>
              </ConfirmButton>
            )}
          </div>
        ))}
        <div style={{ padding: '8px 16px 0' }}>
          {edit === 'newsolo' ? (
            <InlineInput placeholder="Например, Энергия" label="Новый пункт итогов" onCancel={() => setEdit(null)} onSave={(v) => run('addSummaryItem', [v])} />
          ) : (
            <button type="button" className="add-pill" disabled={busy || offline} onClick={() => setEdit('newsolo')}>+ Пункт итогов</button>
          )}
        </div>
      </section>

      <StatesEditor />

      <div className="muted">
        Нажми на название, чтобы переименовать. Новое дело встаёт перед «Другое» своей категории, новая категория — перед итогами дня.
        Отметки и история при переименовании и переносе сохраняются: строка таблицы переезжает целиком.
      </div>
    </div>
  );
}

const FRESH = ['#ff9900', '#4a86e8', '#93c47d', '#e06666', '#b4a7d6', '#f6b26b'];

/** «Состояния»: цвета отметок, от лучшего к худшему. Только онлайн, проверки — как в saveStates. */
function StatesEditor() {
  const states = useDay((s) => s.states);
  const net = useDay((s) => s.net);
  const saveStates = useDay((s) => s.saveStates);
  const [draft, setDraft] = useState<DayState[] | null>(null);
  const [busy, setBusy] = useState(false);
  const offline = net === 'offline';

  if (!draft) {
    return (
      <section className="card" style={{ gap: 12 }}>
        <div className="between"><h2>Состояния</h2>
          <button type="button" className="chip" disabled={!states.length || offline} onClick={() => setDraft(states.map((x) => ({ ...x })))}>Изменить</button>
        </div>
        <div className="wrap" style={{ gap: 6 }}>
          {states.map((x) => (
            <span key={x.color} className="mark"><i className="swatch-dot" style={{ background: x.color }} />{x.name}</span>
          ))}
          <span className="mark"><i className="swatch-dot" style={{ background: PLAN }} />В планах</span>
        </div>
      </section>
    );
  }

  const err = validateStates(draft);
  const dropped = droppedColors(states, draft);
  const dirty = JSON.stringify(draft.map((x) => [x.name.trim(), x.color.toLowerCase()])) !== JSON.stringify(states.map((x) => [x.name, x.color]));
  const patch = (i: number, p: Partial<DayState>) => setDraft(draft.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const swap = (i: number, j: number) => { const d = draft.slice(); [d[i], d[j]] = [d[j], d[i]]; setDraft(d); };
  const add = () => {
    const used = new Set(draft.map((x) => x.color.toLowerCase()));
    setDraft([...draft, { name: '', color: FRESH.find((c) => !used.has(c)) || '#888888' }]);
  };
  async function save() {
    setBusy(true);
    const ok = await saveStates(draft!.map((x) => ({ name: x.name.trim(), color: x.color.toLowerCase() })));
    setBusy(false);
    if (ok) { setDraft(null); toast('Состояния сохранены'); }
  }

  return (
    <section className="card" style={{ gap: 10 }}>
      <h2>Состояния</h2>
      <div className="muted">Порядок — от лучшего к худшему: по нему строятся графики и уровень дня. «Перенос» и «Отмена» не считаются выполненными.</div>
      {draft.map((x, i) => (
        <div key={i} className="row" style={{ gap: 4 }}>
          <label className="swatch-pick" style={{ background: x.color }} aria-label={`Цвет «${x.name || 'нового состояния'}»`}>
            <input type="color" value={x.color} onChange={(e) => patch(i, { color: e.target.value.toLowerCase() })} />
          </label>
          <input className="field" style={{ flex: 1, minWidth: 0, height: 44, padding: '0 10px' }} value={x.name} maxLength={40}
            placeholder="Название" aria-label={`Название состояния ${i + 1}`} autoFocus={!x.name && i === draft.length - 1}
            onChange={(e) => patch(i, { name: e.target.value })} />
          <button type="button" className="icon-btn" style={{ width: 34 }} disabled={!i} aria-label={`Выше: ${x.name}`} onClick={() => swap(i, i - 1)}><Icon name="up" size={18} /></button>
          <button type="button" className="icon-btn" style={{ width: 34 }} disabled={i === draft.length - 1} aria-label={`Ниже: ${x.name}`} onClick={() => swap(i, i + 1)}><Icon name="down" size={18} /></button>
          <button type="button" className="icon-btn" style={{ width: 34 }} disabled={draft.length < 2} aria-label={`Убрать: ${x.name}`} onClick={() => setDraft(draft.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
        </div>
      ))}
      <div className="row muted" style={{ gap: 10, paddingLeft: 6 }}><i className="swatch-dot" style={{ background: PLAN }} />В планах — служебное, не меняется</div>
      <button type="button" className="add-pill" style={{ alignSelf: 'flex-start' }} onClick={add}>+ Состояние</button>
      {err && <div className="banner err" role="alert"><Icon name="alert" size={20} /><div>{err}</div></div>}
      {!err && dropped.length > 0 && (
        <div className="banner" role="status"><Icon name="alert" size={20} />
          <div>Уже отмеченные дни не перекрашиваются. Отметки цветом {dropped.map((d) => `«${d.name}»`).join(', ')} останутся в таблице как «свой цвет»
            {dropped.some((d) => SKIP.test(d.name)) ? ' и начнут считаться выполненными' : ''}.</div>
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="secondary" style={{ flex: 1 }} disabled={busy} onClick={() => setDraft(null)}>Отмена</button>
        <button type="button" className="primary" style={{ flex: 2, height: 48 }} disabled={busy || !!err || !dirty || offline} onClick={save}>
          {busy ? 'Сохраняю…' : offline ? 'Нужен интернет' : 'Сохранить'}
        </button>
      </div>
    </section>
  );
}
