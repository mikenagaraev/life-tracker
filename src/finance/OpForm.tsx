import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { dayLabel, monthName, nowTime, num, parseAmount, todayIso, uid } from '../core/format';
import { Icon } from '../core/icons';
import { ConfirmButton, toast } from '../core/ui';
import { CurrencySheet, TYPE_UI } from './components';
import { QUICK, currency } from './data';
import { addCat, budgetStatus, children, convert, findByNames, nameTaken, opCategory, pathTo, periodRange } from './logic';
import { useFinance } from './store';
import type { Op, OpType, Pay } from './types';

const TYPES: OpType[] = ['exp', 'inc', 'oth'];

/** Форма операции: и новая запись, и правка из истории. */
export function OpForm({ initial, onDone, aside, startType }: { initial?: Op; onDone?: () => void; aside?: ReactNode; startType?: OpType }) {
  const cats = useFinance((s) => s.cats);
  const setCats = useFinance((s) => s.setCats);
  const mine = useFinance((s) => s.settings.mine);
  const rates = useFinance((s) => s.rates);
  const net = useFinance((s) => s.net);
  const saveOp = useFinance((s) => s.saveOp);
  const deleteOp = useFinance((s) => s.deleteOp);

  const [type, setType] = useState<OpType>(initial?.type || startType || 'exp');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [cur, setCur] = useState(initial?.cur || mine[0] || 'GEL');
  const [pay, setPay] = useState<Pay>(initial?.pay || 'Карта');
  const [catId, setCatId] = useState<string | null>(() => (initial ? findByNames(cats, initial.type, initial.cat, initial.sub) : null));
  const [comment, setComment] = useState(initial?.comment || '');
  const [date, setDate] = useState(initial?.date || todayIso());
  const [adding, setAdding] = useState<number | null>(null); // 0 — новая категория, n — подкатегория уровня n
  const [addText, setAddText] = useState('');
  const [curOpen, setCurOpen] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);

  const ui = TYPE_UI[type];
  const path = useMemo(() => (catId ? pathTo(cats, catId) : []), [cats, catId]);
  const roots = children(cats, null, type);
  const value = parseAmount(amount);
  const c = currency(cur);
  const chips = mine.includes(cur) ? mine : [...mine, cur];

  // Старая запись с категорией, которой больше нет в дереве, — показываем как есть.
  const legacy = initial && !catId ? `${initial.cat}${initial.sub ? ' › ' + initial.sub : ''}` : '';

  let hint = 'Введите сумму';
  if (value > 0) {
    if (cur === 'USD') hint = 'Доллар — валюта статистики';
    else {
      const usd = convert(value, cur, 'USD', rates);
      hint = usd === null ? 'Курс подтяну при синхронизации' : `≈ ${num(usd)} $ ${net === 'offline' ? 'по последнему курсу, уточню при синхронизации' : 'по курсу на дату операции'}`;
    }
  }

  function switchType(t: OpType) {
    setType(t);
    setCatId(null);
    setAdding(null);
  }

  function confirmAdd(parentPath: string[]) {
    const name = addText.trim();
    if (!name) return;
    const parent = parentPath.length ? parentPath[parentPath.length - 1] : null;
    if (nameTaken(cats, type, parent, name)) return toast('Такое название здесь уже есть');
    const id = uid('c');
    setCats(addCat(cats, type, parent, name, id));
    setCatId(id);
    setAdding(null);
    setAddText('');
  }

  function submit() {
    if (!(value > 0)) return toast('Введи сумму');
    if (!catId && !legacy) return toast('Выбери категорию');
    const where = catId ? opCategory(cats, catId) : { cat: initial!.cat, sub: initial!.sub };
    const op: Op = {
      id: initial?.id || uid('f'),
      date,
      time: initial?.time || nowTime(),
      type,
      amount: Math.round(value * 100) / 100,
      cur,
      pay,
      cat: where.cat,
      sub: where.sub,
      comment: comment.trim(),
      updated: Date.now(),
      // курс пересчитает сервер, если поменялись сумма, валюта или дата
      usd: initial && initial.amount === value && initial.cur === cur && initial.date === date ? initial.usd : null,
      gel: initial && initial.amount === value && initial.cur === cur && initial.date === date ? initial.gel : null,
    };
    saveOp(op);
    toast(initial ? '✓ Изменено' : net === 'offline' ? '✓ Сохранено на телефоне — отправлю, когда будет сеть' : '✓ Сохранено');
    if (!initial) {
      setAmount('');
      setComment('');
      setPay('Карта');
      setCatId(null);
      setDate(todayIso());
    }
    onDone?.();
  }

  const vars = { '--acc': ui.color, '--acc-soft': ui.soft } as CSSProperties;
  const saveWord = initial ? 'Сохранить изменения' : type === 'exp' ? 'Сохранить приобретение' : type === 'inc' ? 'Сохранить доход' : 'Сохранить';

  return (
    <div className="col" style={{ ...vars, gap: 16 }}>
      <div className="between">
        <button type="button" className="pill" onClick={() => dateRef.current?.showPicker?.() ?? dateRef.current?.focus()} style={{ position: 'relative' }}>
          <Icon name="calendar" size={18} />{dayLabel(date)}
          <input ref={dateRef} type="date" value={date} max="2099-12-31" aria-label="Дата операции"
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
        </button>
        {aside}
      </div>

      <div className="seg" role="group" aria-label="Тип операции" style={{ gridTemplateColumns: '1.45fr 1fr 1fr' }}>
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={t === type} className={t === type ? 'on' : ''}
            style={t === type ? { color: TYPE_UI[t].color } : undefined} onClick={() => switchType(t)}>{TYPE_UI[t].label}</button>
        ))}
      </div>

      <div className="card" style={{ gap: 14 }}>
        <label className="label" htmlFor="amount">{type === 'exp' ? 'Сколько потратил' : type === 'inc' ? 'Сколько получил' : 'Сумма'}</label>
        <div className="amount">
          {ui.sign && <span className="sign" aria-hidden="true">{ui.sign}</span>}
          <input id="amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <button type="button" className="cur-btn" aria-haspopup="dialog" onClick={() => setCurOpen(true)}>
            {c.sym} {c.code}<Icon name="chevDown" size={16} stroke={2.6} />
          </button>
        </div>
        <div className="wrap" role="radiogroup" aria-label="Мои валюты" style={{ gap: 6 }}>
          {chips.map((code) => (
            <button key={code} type="button" role="radio" aria-checked={code === cur} className={'chip' + (code === cur ? ' on' : '')} onClick={() => setCur(code)}>
              {currency(code).sym} {currency(code).name}
            </button>
          ))}
        </div>
        <div className="row" role="radiogroup" aria-label="Способ оплаты" style={{ gap: 6 }}>
          <span className="label" style={{ marginRight: 4 }}>Оплата</span>
          {(['Карта', 'Кэш'] as Pay[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={p === pay} className={'chip' + (p === pay ? ' on' : '')} onClick={() => setPay(p)}>{p}</button>
          ))}
        </div>
        <div className="muted">{hint}</div>
      </div>

      <div className="col">
        <div className="between">
          <h2>{type === 'exp' ? 'За что' : type === 'inc' ? 'Вид дохода' : 'Что это'}</h2>
          {legacy && <span className="muted">Было: {legacy}</span>}
        </div>
        {type === 'oth' && <div className="muted" style={{ marginTop: -6 }}>Не считается ни приобретением, ни доходом — в статистике отдельной строкой.</div>}
        <div className="tiles">
          {roots.map((r) => {
            const on = path[0]?.id === r.id;
            return (
              <button key={r.id} type="button" className={'tile' + (on ? ' on' : '')} aria-pressed={on} onClick={() => { setCatId(r.id); setAdding(null); }}>
                <Icon name={r.icon || 'tag'} size={24} stroke={1.8} />{r.name}
              </button>
            );
          })}
          <button type="button" className="tile add" onClick={() => { setAdding(0); setAddText(''); }}>
            <Icon name="plus" size={24} />Новая
          </button>
        </div>
        {adding === 0 && (
          <div className="card" style={{ border: '1.5px solid var(--acc)' }}>
            <label className="label" htmlFor="newroot">Новая категория</label>
            <div className="inline-add">
              <input id="newroot" className="field" autoFocus value={addText} onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAdd([])} placeholder="Например, Животные" />
              <button type="button" onClick={() => confirmAdd([])}>Добавить</button>
            </div>
            <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(null)}>Отмена</button>
          </div>
        )}
      </div>

      {path.map((node, i) => {
        const depth = i + 1;
        const parentPath = path.slice(0, depth).map((n) => n.id);
        const kids = children(cats, node.id);
        const chosen = path[depth]?.id;
        const title = path.slice(0, depth).map((n) => n.name).join(' › ');
        return (
          <fieldset key={node.id} className="card" style={{ border: 0, margin: 0 }}>
            <legend className="sr">{title}</legend>
            <div className="label">{kids.length ? `${title} — уточни` : title}</div>
            {kids.length > 0 ? (
              <div className="wrap">
                {[{ id: '', name: 'Общее' }, ...kids].map((k) => {
                  const on = k.id ? k.id === chosen : !chosen;
                  const more = k.id && children(cats, k.id).length > 0;
                  return (
                    <label key={k.id || 'all'} className={'radio' + (on ? ' on' : '')}>
                      <input type="radio" name={`lvl${depth}`} checked={on} onChange={() => setCatId(k.id || node.id)} />
                      <span className="dot" />{k.name}{more && <Icon name="chevRight" size={14} stroke={2.4} />}
                    </label>
                  );
                })}
                <button type="button" className="add-pill" onClick={() => { setAdding(depth); setAddText(''); }}>+ Добавить</button>
              </div>
            ) : (
              <div className="col" style={{ gap: 6 }}>
                {depth === 1 && (
                  <div className="muted" style={{ fontSize: 14 }}>
                    {node.icon === 'shop' ? 'Магазин — для смешанного чека: продукты, быт, всё вместе.' : `Сохранится как «${node.name}».`}
                  </div>
                )}
                <button type="button" className="add-pill" style={{ alignSelf: 'flex-start' }} onClick={() => { setAdding(depth); setAddText(''); }}>
                  + Подкатегория для «{node.name}»
                </button>
              </div>
            )}
            {adding === depth && (
              <div className="inline-add">
                <label className="sr" htmlFor={`add${depth}`}>Название подкатегории</label>
                <input id={`add${depth}`} className="field" autoFocus value={addText} placeholder="Название"
                  onChange={(e) => setAddText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmAdd(parentPath)} />
                <button type="button" onClick={() => confirmAdd(parentPath)}>Добавить</button>
              </div>
            )}
          </fieldset>
        );
      })}

      {type === 'exp' && path[0] && <BudgetHint cat={path[0].name} date={date} skip={initial?.id} />}

      <div className="card">
        <label className="label" htmlFor="comment">Комментарий</label>
        <textarea id="comment" className="field" rows={2} placeholder="Что это было?" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="wrap" style={{ gap: 6 }}>
          {QUICK[type].map((q) => (
            <button key={q} type="button" className="chip dashed"
              onClick={() => setComment((v) => (v.trim() ? `${v.trim()}, ${q.toLowerCase()}` : q))}>+ {q}</button>
          ))}
        </div>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <button type="button" className="primary" onClick={submit}>
          {saveWord}{value > 0 ? ` · ${num(value)} ${c.sym}` : ''}
        </button>
        <div className="muted" style={{ textAlign: 'center' }}>
          {net === 'offline' ? 'Сохранится на телефоне и уйдёт в Drive, когда появится сеть' : 'Сразу запишется в Google Drive'}
        </div>
        {initial && (
          <ConfirmButton className="secondary danger" onConfirm={() => { deleteOp(initial.id); toast('Удалено'); onDone?.(); }}>
            Удалить запись
          </ConfirmButton>
        )}
      </div>

      {curOpen && <CurrencySheet value={cur} onPick={setCur} onClose={() => setCurOpen(false)} />}
    </div>
  );
}

/** «Еда: осталось 320 ₾ из 800 в ноябре» — если у категории есть бюджет. */
function BudgetHint({ cat, date, skip }: { cat: string; date: string; skip?: string }) {
  const limit = useFinance((s) => s.settings.budgets?.[cat]);
  const cur = useFinance((s) => s.settings.budgetCur || 'GEL');
  const ops = useFinance((s) => s.ops);
  const rates = useFinance((s) => s.rates);
  if (!limit) return null;
  const range = periodRange('month', date);
  const l = budgetStatus(Object.values(ops).filter((o) => o.id !== skip), range, { [cat]: limit }, cur, rates).lines[0];
  const sym = cur === 'USD' ? '$' : '₾';
  return (
    <div className="muted" style={{ padding: '0 4px', color: l.left < 0 ? 'var(--err)' : undefined }}>
      Бюджет «{cat}» на {monthName(Number(date.slice(5, 7)) - 1).toLowerCase()}: {l.left >= 0 ? `осталось ${num(l.left, 0)} ${sym} из ${num(limit, 0)}` : `уже перерасход ${num(-l.left, 0)} ${sym}`}
    </div>
  );
}
