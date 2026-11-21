import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { readConnFromHash, type Conn } from './core/api';
import { ToastHost, toast } from './core/ui';
import { DayApp } from './day/DayApp';
import { startDayAutoSync, useDay } from './day/store';
import { FinanceApp } from './finance/FinanceApp';
import { startAutoSync, useFinance } from './finance/store';
import { LifeApp } from './life/LifeApp';
import './styles.css';

const el = document.getElementById('root')!;
const app = el.dataset.app as 'life' | 'finance' | 'day';
const useFin = app !== 'day';
const useDayModule = app !== 'finance';

function merge(from: Partial<Conn> | null, cur: Conn | null): Conn | null {
  if (!from) return null;
  const url = from.url || cur?.url || '';
  const token = from.token || cur?.token || '';
  return url && token ? { url, token } : null;
}

async function boot() {
  // Ссылка-приглашение: #k=&u= (финансы), #dk=&du= (трекер дня). Сразу убираем из адресной строки.
  const hash = location.hash;
  const finLink = readConnFromHash(hash);
  const dayLink = readConnFromHash(hash, 'd');
  if (finLink || dayLink) history.replaceState(null, '', location.pathname + location.search);

  // Данные с телефона — мгновенно; синхронизация идёт в фоне.
  await Promise.all([useFin ? useFinance.getState().init() : null, useDayModule ? useDay.getState().init() : null]);

  if (useFin) {
    const c = merge(finLink, useFinance.getState().conn);
    if (c) void useFinance.getState().setConn(c).then(() =>
      toast(useFinance.getState().net === 'idle' ? '✓ Финансы подключены' : 'Финансы: не получилось подключиться'));
    startAutoSync();
  }
  if (useDayModule) {
    const c = merge(dayLink, useDay.getState().conn);
    if (c) void useDay.getState().setConn(c).then(() =>
      toast(useDay.getState().net === 'idle' ? '✓ Трекер дня подключён' : 'Трекер дня: не получилось подключиться'));
    startDayAutoSync();
  }

  createRoot(el).render(
    <StrictMode>
      <div className="app">
        {app === 'finance' ? <FinanceApp /> : app === 'day' ? <DayApp /> : <LifeApp />}
        <ToastHost />
      </div>
    </StrictMode>,
  );
}

void boot();
if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });
