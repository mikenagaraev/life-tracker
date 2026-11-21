import { useMemo, useState, type ReactNode } from 'react';
import { pref } from '../core/db';
import { dayLabel, num, todayIso } from '../core/format';
import { Icon } from '../core/icons';
import { BottomNav, Seg, type NavItem } from '../core/ui';
import { DaySettingsSheet, DayScreen } from '../day/DayScreen';
import { PLAN, buildModel, norm, progress } from '../day/logic';
import { useDay } from '../day/store';
import { currency } from '../finance/data';
import { FinanceScreen, type FinTab } from '../finance/FinanceApp';
import { dayTotals } from '../finance/logic';
import { SettingsSheet, SetupScreen } from '../finance/Settings';
import { useFinance } from '../finance/store';

type Tab = 'home' | 'day' | 'fin';

const NAV: NavItem[] = [
  { key: 'home', label: 'Главная', icon: 'home2' },
  { key: 'day', label: 'День', icon: 'check' },
  { key: 'fin', label: 'Финансы', icon: 'chart' },
];

function BigCard({ color, icon, title, onClick, children }: { color: string; icon: string; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="card" onClick={onClick} style={{ border: 0, textAlign: 'left', gap: 14, padding: 20 }}>
      <div className="between">
        <div className="row" style={{ gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 14, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={24} stroke={2.2} />
          </span>
          <h2 style={{ fontSize: 20 }}>{title}</h2>
        </div>
        <Icon name="chevRight" size={22} color="var(--faint)" />
      </div>
      {children}
    </button>
  );
}

function DayCard({ onOpen }: { onOpen: () => void }) {
  const days = useDay((s) => s.days);
  const queue = useDay((s) => s.queue);
  const conn = useDay((s) => s.conn);
  const today = todayIso();
  const info = useMemo(() => {
    if (!days[today]) return null;
    const d = useDay.getState().view(today)!;
    const m = buildModel(d);
    const p = progress(m, d.states);
    const planned = m.cats.reduce((n, c) => n + c.items.filter((i) => norm(i.color) === PLAN).length + c.oneoffs.filter((o) => norm(o.color) === PLAN).length, 0);
    return { ...p, planned };
  }, [days, queue, today]);
  return (
    <BigCard color="var(--day)" icon="check" title="Трекер дня" onClick={onOpen}>
      {!conn ? (
        <div className="muted" style={{ fontSize: 14 }}>Не подключён — нажми, чтобы подключить таблицу.</div>
      ) : !info ? (
        <div className="muted" style={{ fontSize: 14 }}>Загружаю сегодняшний день…</div>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span className="stat-big">{info.done}</span>
            <span className="muted" style={{ fontSize: 15 }}>из {info.total} отмечено</span>
          </div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${info.total ? (info.done / info.total) * 100 : 0}%`, background: 'var(--day)' }} /></div>
          <div className="muted" style={{ fontSize: 14 }}>{info.planned ? `В планах на сегодня: ${info.planned}` : 'На сегодня ничего не запланировано'}</div>
        </>
      )}
    </BigCard>
  );
}

function FinanceCard({ onOpen }: { onOpen: () => void }) {
  const ops = useFinance((s) => s.ops);
  const conn = useFinance((s) => s.conn);
  const today = todayIso();
  const todays = useMemo(() => Object.values(ops).filter((o) => o.date === today), [ops, today]);
  const totals = dayTotals(todays);
  const spent = totals.filter((t) => t.exp).map((t) => `${num(t.exp)} ${currency(t.cur).sym}`);
  const got = totals.filter((t) => t.inc).map((t) => `${num(t.inc)} ${currency(t.cur).sym}`);
  return (
    <BigCard color="var(--exp)" icon="chart" title="Трекер финансов" onClick={onOpen}>
      {!conn ? (
        <div className="muted" style={{ fontSize: 14 }}>Не подключён — нажми, чтобы подключить таблицу.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="muted">Потрачено сегодня</span>
              <span style={{ font: '800 22px var(--head)' }}>{spent.length ? spent.join(' · ') : '0'}</span>
            </div>
            <div className="col" style={{ gap: 2 }}>
              <span className="muted">Доход сегодня</span>
              <span style={{ font: '800 22px var(--head)', color: got.length ? 'var(--inc)' : undefined }}>{got.length ? `+${got.join(' · +')}` : '0'}</span>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 14 }}>{todays.length ? `Записей за сегодня: ${todays.length}` : 'Сегодня ещё ничего не записано'}</div>
        </>
      )}
    </BigCard>
  );
}

export function LifeApp() {
  const finConn = useFinance((s) => s.conn);
  const [tab, setTab] = useState<Tab>(() => {
    const t = pref('life:tab');
    return t === 'day' || t === 'fin' ? t : 'home';
  });
  const [finTab, setFinTab] = useState<FinTab>(() => (pref('life:fin') as FinTab) || 'record');
  const [settings, setSettings] = useState<'fin' | 'day' | null>(null);
  const go = (t: string) => { setTab(t as Tab); pref('life:tab', t); window.scrollTo(0, 0); };
  const goFin = (t: FinTab) => { setFinTab(t); pref('life:fin', t); window.scrollTo(0, 0); };

  return (
    <>
      <main className="page">
        {tab === 'home' && (
          <>
            <div className="col" style={{ gap: 2, paddingTop: 4 }}>
              <div className="label">{dayLabel(todayIso())}</div>
              <h1 style={{ fontSize: 30 }}>Трекер жизни</h1>
            </div>
            <DayCard onOpen={() => go('day')} />
            <FinanceCard onOpen={() => { goFin('record'); go('fin'); }} />
          </>
        )}
        {tab === 'day' && <DayScreen onSettings={() => setSettings('day')} />}
        {tab === 'fin' && (
          !finConn ? <SetupScreen /> : (
            <>
              <Seg<FinTab> small label="Раздел финансов" value={finTab} onChange={goFin}
                items={[{ key: 'record', label: 'Добавить' }, { key: 'history', label: 'История' }, { key: 'stats', label: 'Статистика' }]} />
              <FinanceScreen tab={finTab} onSettings={() => setSettings('fin')} />
            </>
          )
        )}
      </main>
      <BottomNav items={NAV} value={tab} onChange={go} />
      {settings === 'fin' && <SettingsSheet onClose={() => setSettings(null)} />}
      {settings === 'day' && <DaySettingsSheet onClose={() => setSettings(null)} />}
    </>
  );
}
