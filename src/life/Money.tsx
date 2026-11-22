import { useMemo } from 'react';
import { num } from '../core/format';
import { Icon } from '../core/icons';
import { currency } from '../finance/data';
import { computeStats, dayTotals, sortOps } from '../finance/logic';
import { useFinance } from '../finance/store';

/** «Деньги за день» на экране трекера дня (только в «Трекере жизни»). */
export function DayMoney({ iso, onOpen, onAdd }: { iso: string; onOpen: () => void; onAdd: () => void }) {
  const ops = useFinance((s) => s.ops);
  const conn = useFinance((s) => s.conn);
  const list = useMemo(() => sortOps(Object.values(ops).filter((o) => !o.deleted && o.date === iso)), [ops, iso]);
  if (!conn) return null;
  const totals = dayTotals(list);
  const fmt = (k: 'exp' | 'inc') => totals.filter((t) => t[k]).map((t) => `${num(t[k])} ${currency(t.cur).sym}`).join(' · ');
  return (
    <section className="card" style={{ gap: 10 }}>
      <div className="between" style={{ alignItems: 'baseline' }}>
        <h2>Деньги за день</h2>
        {list.length > 0 && <button type="button" className="link" style={{ minHeight: 32 }} onClick={onOpen}>В финансы ›</button>}
      </div>
      {!list.length ? (
        <div className="between">
          <span className="muted">В этот день ничего не записано</span>
          <button type="button" className="chip" onClick={onAdd}>+ Записать</button>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            {fmt('exp') && <span><span className="muted">Потрачено </span><b>{fmt('exp')}</b></span>}
            {fmt('inc') && <span><span className="muted">Доход </span><b style={{ color: 'var(--inc)' }}>+{fmt('inc')}</b></span>}
          </div>
          <div className="col" style={{ gap: 4 }}>
            {list.slice(0, 4).map((o) => (
              <div key={o.id} className="between" style={{ fontSize: 14 }}>
                <span className="ellipsis" style={{ minWidth: 0 }}>{o.cat}{o.comment ? <span className="muted"> · {o.comment}</span> : null}</span>
                <span style={{ flex: 'none', color: o.type === 'inc' ? 'var(--inc)' : undefined }}>{o.type === 'inc' ? '+' : o.type === 'exp' ? '−' : ''}{num(o.amount)} {currency(o.cur).sym}</span>
              </div>
            ))}
            {list.length > 4 && <span className="muted">и ещё {list.length - 4}</span>}
          </div>
        </>
      )}
    </section>
  );
}

/** «Деньги за период» в сводке трекера дня (только в «Трекере жизни»). */
export function PeriodMoney({ from, to, onOpen }: { from: string; to: string; onOpen: () => void }) {
  const ops = useFinance((s) => s.ops);
  const conn = useFinance((s) => s.conn);
  const rates = useFinance((s) => s.rates);
  const cur = useFinance((s) => s.settings.statsCur);
  const st = useMemo(() => computeStats(Object.values(ops), 'month', { from, to }, cur, rates), [ops, from, to, cur, rates]);
  if (!conn) return null;
  const sym = cur === 'USD' ? '$' : '₾';
  const empty = !st.expense && !st.income;
  return (
    <button type="button" className="card" onClick={onOpen} style={{ border: 0, textAlign: 'left', gap: 8 }}>
      <div className="between"><h2>Деньги за {from === to ? 'день' : 'период'}</h2><Icon name="chevRight" size={18} color="var(--faint)" /></div>
      {empty ? <span className="muted">Записей нет</span> : (
        <>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <span><span className="muted">Приобретения </span><b>{num(st.expense, 0)} {sym}</b></span>
            {st.income > 0 && <span><span className="muted">Доходы </span><b style={{ color: 'var(--inc)' }}>{num(st.income, 0)} {sym}</b></span>}
          </div>
          {st.expByCat.length > 0 && <span className="muted">Больше всего: {st.expByCat.slice(0, 3).map((b) => `${b.label} ${num(b.value, 0)} ${sym}`).join(' · ')}</span>}
        </>
      )}
    </button>
  );
}
