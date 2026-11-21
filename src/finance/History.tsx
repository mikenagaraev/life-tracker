import { useMemo, useState } from 'react';
import { dayLabel, num } from '../core/format';
import { Icon } from '../core/icons';
import { Seg, Sheet } from '../core/ui';
import { TYPE_UI } from './components';
import { currency } from './data';
import { children, dayTotals, sortOps } from './logic';
import { OpForm } from './OpForm';
import { useFinance } from './store';
import type { Op, OpType } from './types';

type Filter = 'all' | OpType;

export function History() {
  const opsMap = useFinance((s) => s.ops);
  const pending = useFinance((s) => s.pending);
  const cats = useFinance((s) => s.cats);
  const ready = useFinance((s) => s.ready);
  const lastSync = useFinance((s) => s.lastSync);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const [edit, setEdit] = useState<Op | null>(null);

  const days = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = sortOps(Object.values(opsMap)).filter(
      (o) => (filter === 'all' || o.type === filter) &&
        (!query || [o.cat, o.sub, o.comment, String(o.amount)].some((s) => s.toLowerCase().includes(query))),
    );
    const groups: { date: string; ops: Op[] }[] = [];
    for (const o of list.slice(0, limit)) {
      const g = groups[groups.length - 1];
      if (g && g.date === o.date) g.ops.push(o);
      else groups.push({ date: o.date, ops: [o] });
    }
    return { groups, more: list.length > limit, total: list.length };
  }, [opsMap, filter, q, limit]);

  const iconOf = (o: Op) => children(cats, null, o.type, true).find((c) => c.name === o.cat)?.icon || 'tag';

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 10 }}>
        <Seg<Filter> small label="Фильтр" value={filter} onChange={setFilter} cols="0.8fr 1.4fr 1fr 1fr"
          items={[{ key: 'all', label: 'Все' }, { key: 'exp', label: 'Приобретения' }, { key: 'inc', label: 'Доходы' }, { key: 'oth', label: 'Другое' }]} />
        <label className="row field" style={{ padding: '0 12px', height: 44 }}>
          <Icon name="search" size={18} />
          <span className="sr">Поиск по записям</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: категория, комментарий, сумма"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontSize: 16 }} />
        </label>
      </div>

      {!ready && <div className="skeleton" style={{ height: 180 }} />}
      {ready && !days.groups.length && (
        <div className="card muted" style={{ fontSize: 14 }}>
          {q || filter !== 'all' ? 'Ничего не нашлось.' : lastSync ? 'Записей пока нет — добавь первую на вкладке «Запись».' : 'Загружаю записи из таблицы…'}
        </div>
      )}

      {days.groups.map((g) => (
        <section key={g.date} className="col" style={{ gap: 8 }}>
          <div className="between" style={{ padding: '0 4px', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 15 }}>{dayLabel(g.date)}</h2>
            <span className="muted">
              {dayTotals(g.ops).map((t) => [t.exp ? `−${num(t.exp)} ${currency(t.cur).sym}` : '', t.inc ? `+${num(t.inc)} ${currency(t.cur).sym}` : ''].filter(Boolean).join(' · ')).filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="card flush">
            {g.ops.map((o) => {
              const ui = TYPE_UI[o.type];
              const isPending = !!pending[o.id];
              const usd = o.cur !== 'USD' && typeof o.usd === 'number' ? `≈ ${num(o.usd)} $` : '';
              return (
                <button key={o.id} type="button" className="list-row" onClick={() => setEdit(o)}>
                  <span className="ic" style={{ background: ui.soft, color: ui.color }}><Icon name={iconOf(o)} size={22} stroke={1.8} /></span>
                  <span className="grow">
                    <span className="ellipsis" style={{ fontWeight: 600 }}>{o.cat}{o.sub ? ` › ${o.sub}` : ''}</span>
                    <span className="ellipsis muted">{[o.comment, o.pay === 'Кэш' ? 'кэш' : ''].filter(Boolean).join(' · ') || 'Без комментария'}</span>
                  </span>
                  <span className="amt" style={{ color: o.type === 'inc' ? 'var(--inc)' : o.type === 'oth' ? 'var(--oth)' : 'var(--ink)' }}>
                    {ui.sign}{num(o.amount)} {currency(o.cur).sym}
                    {isPending ? <small className="pending"><Icon name="clock" size={13} stroke={2.4} />ждёт сети</small> : usd ? <small>{usd}</small> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {days.more && <button type="button" className="secondary" onClick={() => setLimit((l) => l + 100)}>Показать ещё ({days.total - limit})</button>}

      {edit && (
        <Sheet title="Запись" full onClose={() => setEdit(null)}>
          <OpForm initial={edit} onDone={() => setEdit(null)} />
        </Sheet>
      )}
    </div>
  );
}
