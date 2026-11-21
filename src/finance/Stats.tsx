import { useMemo, useState } from 'react';
import { monthGen, monthName, num, parseIso, todayIso } from '../core/format';
import { Icon } from '../core/icons';
import { Seg } from '../core/ui';
import { computeStats, periodRange, shiftAnchor, type Bucket, type Period } from './logic';
import { useFinance } from './store';

function rangeTitle(period: Period, from: string, to: string): string {
  const a = parseIso(from), b = parseIso(to);
  if (period === 'year') return String(a.getFullYear());
  if (period === 'month') return `${monthName(a.getMonth())} ${a.getFullYear()}`;
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${monthGen(a.getMonth())}`
    : `${a.getDate()} ${monthGen(a.getMonth())} – ${b.getDate()} ${monthGen(b.getMonth())}`;
}

function Breakdown({ title, total, items, color, sym }: { title: string; total: number; items: Bucket[]; color: string; sym: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = items[0]?.value || 1;
  return (
    <section className="card" style={{ gap: 14 }}>
      <div className="between" style={{ alignItems: 'baseline' }}>
        <h2>{title}</h2>
        <span className="muted">{num(total, 0)} {sym}</span>
      </div>
      {!items.length && <div className="muted">Нет записей за период</div>}
      {items.map((b) => {
        const pct = total ? Math.round((b.value / total) * 100) : 0;
        const canOpen = (b.sub?.length || 0) > 0;
        return (
          <div key={b.label} className="col" style={{ gap: 6 }}>
            <button type="button" className="between" disabled={!canOpen} aria-expanded={canOpen ? open === b.label : undefined}
              onClick={() => setOpen(open === b.label ? null : b.label)}
              style={{ border: 0, background: 'none', padding: 0, fontSize: 14, opacity: 1, textAlign: 'left' }}>
              <span className="row" style={{ fontWeight: 600, gap: 4 }}>
                {b.label}{canOpen && <Icon name={open === b.label ? 'up' : 'down'} size={14} stroke={2.4} />}
              </span>
              <span style={{ color: 'var(--ink2)' }}>{num(b.value, 0)} {sym} <span style={{ color: 'var(--faint)' }}>· {pct}%</span></span>
            </button>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (b.value / max) * 100)}%`, background: color }} /></div>
            {open === b.label && (
              <div className="col" style={{ gap: 4, paddingLeft: 12, borderLeft: '2px solid var(--line2)' }}>
                {b.sub!.map((s) => (
                  <div key={s.label} className="between" style={{ fontSize: 13 }}>
                    <span>{s.label}</span><span className="muted">{num(s.value, 0)} {sym}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function Stats() {
  const ops = useFinance((s) => s.ops);
  const rates = useFinance((s) => s.rates);
  const statsCur = useFinance((s) => s.settings.statsCur);
  const setSettings = useFinance((s) => s.setSettings);
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(todayIso());
  const [sel, setSel] = useState<string | null>(null);

  const range = periodRange(period, anchor);
  const st = useMemo(() => computeStats(Object.values(ops), period, range, statsCur, rates), [ops, period, range.from, range.to, statsCur, rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const sym = statsCur === 'USD' ? '$' : '₾';
  const maxBar = Math.max(...st.bars.map((b) => b.value), 1);
  const days = st.bars.filter((b) => b.value > 0).length;
  const isCurrent = range.from <= todayIso() && todayIso() <= range.to;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="between">
        <Seg<Period> small label="Период" value={period} onChange={(p) => { setPeriod(p); setSel(null); }}
          items={[{ key: 'week', label: 'Неделя' }, { key: 'month', label: 'Месяц' }, { key: 'year', label: 'Год' }]} />
        <Seg<'USD' | 'GEL'> small label="Валюта статистики" value={statsCur} onChange={(v) => setSettings({ statsCur: v })}
          items={[{ key: 'USD', label: '$' }, { key: 'GEL', label: '₾' }]} />
      </div>

      <div className="between">
        <button type="button" className="icon-btn" aria-label="Предыдущий период" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}><Icon name="chevLeft" /></button>
        <div className="col" style={{ alignItems: 'center', gap: 0 }}>
          <h2>{rangeTitle(period, range.from, range.to)}</h2>
          {!isCurrent && <button type="button" className="link" style={{ minHeight: 28, fontSize: 13 }} onClick={() => setAnchor(todayIso())}>к текущему</button>}
        </div>
        <button type="button" className="icon-btn" aria-label="Следующий период" onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}><Icon name="chevRight" /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div className="card" style={{ gap: 6 }}>
          <div className="row label" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--inc)' }} />Доходы</div>
          <div className="stat-big">{num(st.income, 0)} {sym}</div>
        </div>
        <div className="card" style={{ gap: 6 }}>
          <div className="row label" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--exp)' }} />Приобретения</div>
          <div className="stat-big">{num(st.expense, 0)} {sym}</div>
        </div>
        <div className="card dark-card" style={{ gridColumn: 'span 2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="col" style={{ gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Осталось за период</div>
            <div className="stat-big">{st.income - st.expense >= 0 ? '+' : ''}{num(st.income - st.expense, 0)} {sym}</div>
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, textAlign: 'right' }}>
            По курсу дня операции{st.other ? <><br />Другое: {num(st.other, 0)} {sym}</> : null}
          </div>
        </div>
      </div>
      {st.unknown > 0 && <div className="muted">{st.unknown} записей без курса — посчитаю после синхронизации.</div>}

      <section className="card" style={{ gap: 14 }}>
        <div className="between" style={{ alignItems: 'baseline' }}>
          <h2>{period === 'year' ? 'Траты по месяцам' : 'Траты по дням'}</h2>
          <span className="muted">{days ? `в среднем ${num(st.expense / days, 0)} ${sym} в ${period === 'year' ? 'месяц' : 'день с тратами'}` : ''}</span>
        </div>
        <div className="cols" role="img" aria-label={`Траты ${period === 'year' ? 'по месяцам' : 'по дням'}, максимум ${num(maxBar, 0)} ${sym}`}>
          {st.bars.map((b) => (
            <div key={b.key} className={sel === b.key ? 'sel' : ''} onClick={() => setSel(sel === b.key ? null : b.key)}
              onMouseEnter={() => setSel(b.key)} onMouseLeave={() => setSel(null)}>
              <i style={{ height: `${b.value ? Math.max(3, (b.value / maxBar) * 100) : 0}%` }} />
              {sel === b.key && <span className="tip">{period === 'year' ? monthName(Number(b.label) - 1) : `${b.label} число`}: {num(b.value, 0)} {sym}</span>}
            </div>
          ))}
        </div>
        <div className="between muted" style={{ marginTop: -6, fontSize: 12 }}>
          <span>{st.bars[0]?.label}</span>
          <span>{st.bars[Math.floor(st.bars.length / 2)]?.label}</span>
          <span>{st.bars[st.bars.length - 1]?.label}</span>
        </div>
      </section>

      <Breakdown title="Приобретения по категориям" total={st.expense} items={st.expByCat} color="var(--exp)" sym={sym} />
      <Breakdown title="Доходы по видам" total={st.income} items={st.incByCat} color="var(--inc)" sym={sym} />
    </div>
  );
}
