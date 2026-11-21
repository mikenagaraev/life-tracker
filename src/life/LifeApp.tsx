import { useMemo, useState } from 'react';
import { pref } from '../core/db';
import { dayLabel, num, todayIso } from '../core/format';
import { Icon } from '../core/icons';
import { BottomNav, type NavItem } from '../core/ui';
import { DAY_TRACKER_URL } from '../day/DayApp';
import { SyncStatus, TYPE_UI } from '../finance/components';
import { currency } from '../finance/data';
import { FinanceScreen, type FinTab } from '../finance/FinanceApp';
import { dayTotals, sortOps } from '../finance/logic';
import { SettingsSheet, SetupScreen } from '../finance/Settings';
import { useFinance } from '../finance/store';
import type { OpType } from '../finance/types';

type Tab = 'today' | FinTab;

const NAV: NavItem[] = [
  { key: 'today', label: 'Сегодня', icon: 'home2' },
  { key: 'record', label: 'Запись', icon: 'plus' },
  { key: 'history', label: 'История', icon: 'list' },
  { key: 'stats', label: 'Статистика', icon: 'chart' },
  { key: 'day', label: 'День', icon: 'check', href: '../life-tracker/day/' },
];

function Today({ onRecord, onSettings, onHistory }: { onRecord: (t: OpType) => void; onSettings: () => void; onHistory: () => void }) {
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
          <h1 style={{ fontSize: 28 }}>Трекер жизни</h1>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <SyncStatus onSetup={onSettings} />
          <button type="button" className="icon-btn" aria-label="Настройки" onClick={onSettings}><Icon name="gear" /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <a className="card" href={DAY_TRACKER_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', gap: 8 }}>
          <div className="row label" style={{ gap: 6 }}><Icon name="check" size={16} color="var(--day)" stroke={2.4} />День</div>
          <div style={{ font: '700 16px var(--head)' }}>Открыть трекер дня</div>
          <div className="muted">Переезжает сюда — пока текущая версия <Icon name="external" size={12} /></div>
        </a>
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
  const [settings, setSettings] = useState(false);
  const go = (t: string) => { setTab(t as Tab); pref('life:tab', t); window.scrollTo(0, 0); };

  if (!conn && net === 'setup') return <main className="page"><SetupScreen /></main>;
  return (
    <>
      <main className="page">
        {tab === 'today'
          ? <Today onSettings={() => setSettings(true)} onHistory={() => go('history')} onRecord={(t) => { setStartType(t); go('record'); }} />
          : <FinanceScreen tab={tab} startType={tab === 'record' ? startType : undefined} onSettings={() => setSettings(true)} />}
      </main>
      <BottomNav items={NAV} value={tab} onChange={go} />
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </>
  );
}
