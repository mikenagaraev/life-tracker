import { useMemo, useState } from 'react';
import { pref } from '../core/db';
import { dayLabel, num, todayIso } from '../core/format';
import { Icon } from '../core/icons';
import { BottomNav, type NavItem } from '../core/ui';
import { DaySettingsSheet, DayScreen } from '../day/DayScreen';
import { buildModel, progress } from '../day/logic';
import { useDay } from '../day/store';
import { SyncStatus, TYPE_UI } from '../finance/components';
import { currency } from '../finance/data';
import { FinanceScreen, type FinTab } from '../finance/FinanceApp';
import { dayTotals, sortOps } from '../finance/logic';
import { SettingsSheet, SetupScreen } from '../finance/Settings';
import { useFinance } from '../finance/store';
import type { OpType } from '../finance/types';

type Tab = 'today' | 'day' | FinTab;

const NAV: NavItem[] = [
  { key: 'today', label: 'Сегодня', icon: 'home2' },
  { key: 'day', label: 'День', icon: 'check' },
  { key: 'record', label: 'Запись', icon: 'plus' },
  { key: 'history', label: 'История', icon: 'list' },
  { key: 'stats', label: 'Статистика', icon: 'chart' },
];

function DayCard({ onOpen }: { onOpen: () => void }) {
  const days = useDay((s) => s.days);
  const queue = useDay((s) => s.queue);
  const conn = useDay((s) => s.conn);
  const today = todayIso();
  const p = useMemo(() => {
    const raw = days[today];
    if (!raw) return null;
    const d = useDay.getState().view(today)!;
    return progress(buildModel(d), d.states);
  }, [days, queue, today]);
  return (
    <button type="button" className="card" onClick={onOpen} style={{ border: 0, textAlign: 'left', gap: 8 }}>
      <div className="row label" style={{ gap: 6 }}><Icon name="check" size={16} color="var(--day)" stroke={2.4} />День</div>
      {conn && p ? (
        <>
          <div className="stat-big">{p.done} <span style={{ fontSize: 16, color: 'var(--muted)' }}>из {p.total}</span></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%`, background: 'var(--day)' }} /></div>
        </>
      ) : (
        <div style={{ font: '700 16px var(--head)' }}>{conn ? 'Загружаю…' : 'Подключить трекер дня'}</div>
      )}
    </button>
  );
}

function Today({ onRecord, onSettings, onHistory, onDay }: { onRecord: (t: OpType) => void; onSettings: () => void; onHistory: () => void; onDay: () => void }) {
  const ops = useFinance((s) => s.ops);
  const today = todayIso();
  const todays = useMemo(() => sortOps(Object.values(ops).filter((o) => o.date === today)), [ops, today]);
  const totals = dayTotals(todays);
  const spent = totals.filter((t) => t.exp).map((t) => `${num(t.exp)} ${currency(t.cur).sym}`);
  const got = totals.filter((t) => t.inc).map((t) => `+${num(t.inc)} ${currency(t.cur).sym}`);
  return (
    <>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 2 }}>
          <div className="label">{dayLabel(today)}</div>
          <h1 style={{ fontSize: 26 }}>Трекер жизни</h1>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <SyncStatus onSetup={onSettings} />
          <button type="button" className="icon-btn" aria-label="Настройки финансов" onClick={onSettings}><Icon name="gear" /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <DayCard onOpen={onDay} />
        <button type="button" className="card" onClick={onHistory} style={{ border: 0, textAlign: 'left', gap: 8 }}>
          <div className="row label" style={{ gap: 6 }}><Icon name="shop" size={16} color="var(--exp)" stroke={2.2} />Потрачено сегодня</div>
          <div className="stat-big">{spent.length ? spent.join(' · ') : '0'}</div>
          <div className="muted">{got.length ? `${got.join(' · ')} доход` : 'доходов нет'}</div>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {(['exp', 'inc', 'oth'] as OpType[]).map((t) => (
          <button key={t} type="button" onClick={() => onRecord(t)}
            style={{ height: 76, border: 0, borderRadius: 18, background: TYPE_UI[t].color, color: 'var(--card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 13, fontWeight: 600 }}>
            <Icon name="plus" size={22} stroke={2.2} />{t === 'exp' ? 'Покупка' : t === 'inc' ? 'Доход' : 'Другое'}
          </button>
        ))}
      </div>

      <section className="card" style={{ gap: 4 }}>
        <div className="between"><h2>Сегодня в финансах</h2><span className="muted">{todays.length ? `${todays.length} зап.` : ''}</span></div>
        {!todays.length && <div className="muted">Пока ничего не записано.</div>}
        {todays.slice(0, 5).map((o) => (
          <div key={o.id} className="between" style={{ padding: '8px 0', borderTop: '1px solid var(--line2)' }}>
            <span className="ellipsis">{o.cat}{o.sub ? ` › ${o.sub}` : ''}{o.comment ? <span className="muted"> · {o.comment}</span> : null}</span>
            <b style={{ color: o.type === 'inc' ? 'var(--inc)' : o.type === 'oth' ? 'var(--oth)' : 'var(--ink)', flex: 'none' }}>
              {TYPE_UI[o.type].sign}{num(o.amount)} {currency(o.cur).sym}
            </b>
          </div>
        ))}
      </section>
    </>
  );
}

export function LifeApp() {
  const net = useFinance((s) => s.net);
  const conn = useFinance((s) => s.conn);
  const [tab, setTab] = useState<Tab>(() => (pref('life:tab') as Tab) || 'today');
  const [startType, setStartType] = useState<OpType>('exp');
  const [settings, setSettings] = useState<'fin' | 'day' | null>(null);
  const go = (t: string) => { setTab(t as Tab); pref('life:tab', t); window.scrollTo(0, 0); };

  if (!conn && net === 'setup' && tab !== 'day') {
    return (
      <>
        <main className="page"><SetupScreen /></main>
        <BottomNav items={NAV} value={tab} onChange={go} />
      </>
    );
  }
  return (
    <>
      <main className="page">
        {tab === 'today' ? (
          <Today onSettings={() => setSettings('fin')} onHistory={() => go('history')} onDay={() => go('day')}
            onRecord={(t) => { setStartType(t); go('record'); }} />
        ) : tab === 'day' ? (
          <DayScreen onSettings={() => setSettings('day')} />
        ) : (
          <FinanceScreen tab={tab} startType={tab === 'record' ? startType : undefined} onSettings={() => setSettings('fin')} />
        )}
      </main>
      <BottomNav items={NAV} value={tab} onChange={go} />
      {settings === 'fin' && <SettingsSheet onClose={() => setSettings(null)} />}
      {settings === 'day' && <DaySettingsSheet onClose={() => setSettings(null)} />}
    </>
  );
}
