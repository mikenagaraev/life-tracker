import { useState } from 'react';
import { pref } from '../core/db';
import { Icon } from '../core/icons';
import { BottomNav, type NavItem } from '../core/ui';
import { OfflineBanner, SyncStatus } from './components';
import { History } from './History';
import { OpForm } from './OpForm';
import { SettingsSheet, SetupScreen } from './Settings';
import { Stats } from './Stats';
import { useFinance } from './store';
import type { OpType } from './types';

export type FinTab = 'record' | 'history' | 'stats';

export function FinanceHeader({ title, onSettings }: { title: string; onSettings: () => void }) {
  return (
    <div className="between">
      <h1>{title}</h1>
      <div className="row" style={{ gap: 4 }}>
        <SyncStatus onSetup={onSettings} />
        <button type="button" className="icon-btn" aria-label="Настройки" onClick={onSettings}><Icon name="gear" /></button>
      </div>
    </div>
  );
}

/** Экраны финансов без нижней навигации — их встраивает и «Трекер финансов», и «Трекер жизни». */
export function FinanceScreen({ tab, startType, onSettings }: { tab: FinTab; startType?: OpType; onSettings: () => void }) {
  if (tab === 'record') {
    return (
      <>
        <OfflineBanner />
        <OpForm key={startType || 'exp'} startType={startType} aside={<SyncStatus onSetup={onSettings} />} />
      </>
    );
  }
  return (
    <>
      <FinanceHeader title={tab === 'history' ? 'История' : 'Статистика'} onSettings={onSettings} />
      <OfflineBanner />
      {tab === 'history' ? <History /> : <Stats />}
    </>
  );
}

export const FIN_NAV: NavItem[] = [
  { key: 'record', label: 'Запись', icon: 'plus' },
  { key: 'history', label: 'История', icon: 'list' },
  { key: 'stats', label: 'Статистика', icon: 'chart' },
];

export function FinanceApp() {
  const net = useFinance((s) => s.net);
  const conn = useFinance((s) => s.conn);
  const [tab, setTab] = useState<FinTab>(() => (pref('fin:tab') as FinTab) || 'record');
  const [settings, setSettings] = useState(false);
  const go = (t: string) => { setTab(t as FinTab); pref('fin:tab', t); window.scrollTo(0, 0); };

  if (!conn && net === 'setup') {
    return <main className="page"><SetupScreen /></main>;
  }
  return (
    <>
      <main className="page">
        <FinanceScreen tab={tab} onSettings={() => setSettings(true)} />
      </main>
      <BottomNav items={FIN_NAV} value={tab} onChange={go} />
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </>
  );
}
