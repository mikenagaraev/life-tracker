import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { readConnFromHash } from './core/api';
import { ToastHost, toast } from './core/ui';
import { DayApp } from './day/DayApp';
import { FinanceApp } from './finance/FinanceApp';
import { startAutoSync, useFinance } from './finance/store';
import { LifeApp } from './life/LifeApp';
import './styles.css';

const el = document.getElementById('root')!;
const app = el.dataset.app as 'life' | 'finance' | 'day';

async function boot() {
  if (app !== 'day') {
    // Ссылка-приглашение: #k=<ключ>&u=<адрес>. Сразу убираем из адресной строки.
    const fromHash = readConnFromHash(location.hash);
    if (fromHash) history.replaceState(null, '', location.pathname + location.search);
    await useFinance.getState().init(); // данные с телефона — мгновенно; синхронизация идёт в фоне
    if (fromHash) {
      const cur = useFinance.getState().conn;
      const url = fromHash.url || cur?.url || '';
      const token = fromHash.token || cur?.token || '';
      if (url && token) {
        void useFinance.getState().setConn({ url, token }).then(() =>
          toast(useFinance.getState().net === 'idle' ? '✓ Таблица подключена' : 'Не получилось подключиться — проверь настройки'),
        );
      }
    }
    startAutoSync();
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
