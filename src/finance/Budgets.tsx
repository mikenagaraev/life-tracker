import { useMemo, useState } from 'react';
import { num, parseAmount, todayIso } from '../core/format';
import { Icon } from '../core/icons';
import { Seg, Sheet, toast } from '../core/ui';
import { budgetStatus, children, monthPace, type Range } from './logic';
import { useFinance } from './store';

const SYM = { USD: '$', GEL: '₾' } as const;

/** Карточка «Бюджеты» в статистике за месяц. */
export function BudgetCard({ range }: { range: Range }) {
  const ops = useFinance((s) => s.ops);
  const rates = useFinance((s) => s.rates);
  const budgets = useFinance((s) => s.settings.budgets);
  const cur = useFinance((s) => s.settings.budgetCur || 'GEL');
  const [edit, setEdit] = useState(false);
  const pace = monthPace(range, todayIso());
  const st = useMemo(() => budgetStatus(Object.values(ops), range, budgets || {}, cur, rates, pace), [ops, range.from, range.to, budgets, cur, rates, pace]); // eslint-disable-line react-hooks/exhaustive-deps
  const sym = SYM[cur];
  const current = pace > 0 && pace < 1;

  if (!st.lines.length) {
    return (
      <>
        <button type="button" className="card row" style={{ gap: 12, border: '1.5px dashed var(--dash)', background: 'transparent', textAlign: 'left' }} onClick={() => setEdit(true)}>
          <Icon name="finance" size={22} />
          <span className="grow"><b style={{ fontWeight: 600 }}>Бюджеты</b><span className="muted">Задай лимит на месяц по категориям — покажу, сколько осталось</span></span>
        </button>
        {edit && <BudgetsSheet onClose={() => setEdit(false)} />}
      </>
    );
  }
  return (
    <section className="card" style={{ gap: 14 }}>
      <div className="between" style={{ alignItems: 'baseline' }}>
        <h2>Бюджеты</h2>
        <button type="button" className="link" style={{ minHeight: 32 }} onClick={() => setEdit(true)}>Настроить</button>
      </div>
      <div className="muted">
        Потрачено {num(st.spent, 0)} из {num(st.limit, 0)} {sym}
        {current ? ` · прошло ${Math.round(pace * 100)}% месяца` : ''}
      </div>
      {st.lines.map((l) => {
        const color = l.state === 'over' ? 'var(--err)' : l.state === 'warn' ? 'var(--warn)' : 'var(--exp)';
        return (
          <div key={l.cat} className="col" style={{ gap: 6 }}>
            <div className="between" style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{l.cat}</span>
              <span style={{ color: l.state === 'over' ? 'var(--err)' : 'var(--ink2)', fontWeight: l.state === 'ok' ? 400 : 600 }}>
                {l.left >= 0 ? `осталось ${num(l.left, 0)} ${sym}` : `перерасход ${num(-l.left, 0)} ${sym}`}
              </span>
            </div>
            <div className="bar-track" style={{ position: 'relative' }} role="img" aria-label={`${l.cat}: ${num(l.spent, 0)} из ${num(l.limit, 0)} ${sym}`}>
              <div className="bar-fill" style={{ width: `${Math.min(100, l.pct * 100)}%`, background: color }} />
              {current && <span className="pace-mark" style={{ left: `${pace * 100}%` }} title="Сегодня" />}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{num(l.spent, 0)} из {num(l.limit, 0)} {sym}</div>
          </div>
        );
      })}
      {current && <div className="muted" style={{ fontSize: 12 }}>Чёрточка — где по плану стоило бы быть сегодня.</div>}
      {edit && <BudgetsSheet onClose={() => setEdit(false)} />}
    </section>
  );
}

/** Лимиты на месяц по верхним категориям приобретений. */
export function BudgetsSheet({ onClose }: { onClose: () => void }) {
  const cats = useFinance((s) => s.cats);
  const settings = useFinance((s) => s.settings);
  const setSettings = useFinance((s) => s.setSettings);
  const [cur, setCur] = useState<'USD' | 'GEL'>(settings.budgetCur || 'GEL');
  const tops = children(cats, null, 'exp');
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(tops.map((c) => [c.name, settings.budgets?.[c.name] ? String(settings.budgets[c.name]) : ''])));
  const total = Object.values(vals).reduce((s, v) => s + (parseAmount(v) || 0), 0);

  function save() {
    const budgets: Record<string, number> = {};
    for (const [k, v] of Object.entries(vals)) { const n = parseAmount(v); if (n > 0) budgets[k] = Math.round(n); }
    setSettings({ budgets, budgetCur: cur });
    toast(Object.keys(budgets).length ? 'Бюджеты сохранены' : 'Бюджеты убраны');
    onClose();
  }

  return (
    <Sheet title="Бюджеты на месяц" onClose={onClose}>
      <div className="between">
        <span className="label">Валюта лимитов</span>
        <Seg<'USD' | 'GEL'> small label="Валюта бюджетов" value={cur} onChange={setCur} items={[{ key: 'GEL', label: '₾' }, { key: 'USD', label: '$' }]} />
      </div>
      <div className="muted">Траты в других валютах пересчитываются по курсу дня покупки. Пустое поле — без лимита.</div>
      <div className="col" style={{ gap: 6 }}>
        {tops.map((c) => (
          <label key={c.id} className="row" style={{ gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
            <input className="field" inputMode="decimal" style={{ width: 120, height: 44, padding: '0 10px', textAlign: 'right' }}
              value={vals[c.name] ?? ''} placeholder="—" aria-label={`Лимит «${c.name}»`}
              onChange={(e) => setVals({ ...vals, [c.name]: e.target.value.replace(/[^\d.,\s]/g, '') })} />
            <span style={{ width: 14 }}>{SYM[cur]}</span>
          </label>
        ))}
      </div>
      <div className="muted">Всего: {num(total, 0)} {SYM[cur]} в месяц</div>
      <button type="button" className="primary" onClick={save}>Сохранить</button>
    </Sheet>
  );
}
