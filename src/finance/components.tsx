import { useState } from 'react';
import { Icon } from '../core/icons';
import { Sheet } from '../core/ui';
import { CURRENCIES, currency } from './data';
import { pendingCount, useFinance } from './store';
import type { OpType } from './types';

export const TYPE_UI: Record<OpType, { label: string; color: string; soft: string; sign: string }> = {
  exp: { label: 'Приобретение', color: 'var(--exp)', soft: 'var(--exp-soft)', sign: '−' },
  inc: { label: 'Доход', color: 'var(--inc)', soft: 'var(--inc-soft)', sign: '+' },
  oth: { label: 'Другое', color: 'var(--oth)', soft: 'var(--oth-soft)', sign: '' },
};

/** Значок состояния синхронизации; по нажатию — синхронизировать сейчас. */
export function SyncStatus({ onSetup }: { onSetup?: () => void }) {
  const net = useFinance((s) => s.net);
  const n = useFinance(pendingCount);
  const error = useFinance((s) => s.error);
  const sync = useFinance((s) => s.sync);
  let cls = '', icon = 'cloud', text = 'Drive · всё сохранено';
  if (net === 'setup') { cls = 'warn'; icon = 'alert'; text = 'Подключить таблицу'; }
  else if (net === 'auth') { cls = 'err'; icon = 'alert'; text = 'Неверный ключ'; }
  else if (net === 'offline') { cls = 'warn'; icon = 'cloudOff'; text = n ? `Офлайн · ${n} ждут` : 'Офлайн'; }
  else if (net === 'error') { cls = 'err'; icon = 'alert'; text = n ? `Ошибка · ${n} ждут` : 'Ошибка связи'; }
  else if (net === 'syncing') { cls = 'sync'; icon = 'sync'; text = n ? `Отправляю · ${n}` : 'Обновляю'; }
  else if (n) { cls = 'warn'; icon = 'clock'; text = `${n} ждут отправки`; }
  return (
    <button type="button" className={'status ' + cls} title={error || undefined}
      onClick={() => (net === 'setup' || net === 'auth' ? onSetup?.() : void sync())}>
      <Icon name={icon} size={16} />{text}
    </button>
  );
}

export function OfflineBanner() {
  const net = useFinance((s) => s.net);
  const error = useFinance((s) => s.error);
  if (net === 'offline')
    return (
      <div className="banner" role="status"><Icon name="cloudOff" size={22} />
        <div><b>Нет интернета — пиши как обычно</b>Записи хранятся на телефоне. Как только появится сеть, сам отправлю их в Google Drive.</div>
      </div>
    );
  if (net === 'error')
    return (
      <div className="banner err" role="status"><Icon name="alert" size={22} />
        <div><b>Не получилось синхронизировать</b>{error}. Записи на телефоне, попробую ещё раз через полминуты.</div>
      </div>
    );
  return null;
}

/** Выбор валюты: мои валюты (кнопки под суммой) + добавить из списка. */
export function CurrencySheet({ value, onPick, onClose }: { value: string; onPick: (code: string) => void; onClose: () => void }) {
  const mine = useFinance((s) => s.settings.mine);
  const setSettings = useFinance((s) => s.setSettings);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const others = CURRENCIES.filter((c) => !mine.includes(c.code) && (!query || c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)));
  return (
    <Sheet title="Валюта" onClose={onClose}>
      <div className="col" style={{ gap: 6 }}>
        <div className="caps">Мои валюты · кнопки под суммой</div>
        {mine.map((code) => {
          const c = currency(code);
          const last = mine.length < 2;
          return (
            <div key={code} className="row" style={{ borderRadius: 14, background: code === value ? 'var(--bg)' : 'transparent' }}>
              <button type="button" className="list-row" style={{ border: 0, padding: '6px 12px' }} onClick={() => { onPick(code); onClose(); }}>
                <span className="ic" style={{ background: 'var(--bg)', borderRadius: 18, width: 36, height: 36, fontWeight: 800 }}>{c.sym}</span>
                <span className="grow"><b style={{ fontWeight: 600 }}>{c.name}</b><span className="muted">{c.code}{code === value ? ' · выбрана' : ''}</span></span>
              </button>
              <button type="button" className="icon-btn" disabled={last} aria-label={`Убрать ${c.name} из моих валют`}
                style={{ color: last ? 'var(--dash)' : 'var(--err)' }}
                onClick={() => setSettings({ mine: mine.filter((m) => m !== code) })}>
                <Icon name="minus" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="col" style={{ gap: 6 }}>
        <div className="caps">Добавить</div>
        <label className="row field" style={{ padding: '0 12px', height: 44 }}>
          <Icon name="search" size={18} />
          <span className="sr">Найти валюту</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Евро, лира, AMD…" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 16 }} />
        </label>
        <div className="col" style={{ gap: 0 }}>
          {others.map((c) => (
            <button key={c.code} type="button" className="list-row" style={{ padding: '6px 12px' }}
              onClick={() => { setSettings({ mine: [...mine, c.code] }); onPick(c.code); onClose(); }}>
              <span className="ic" style={{ background: 'var(--bg)', borderRadius: 18, width: 36, height: 36, fontWeight: 800 }}>{c.sym}</span>
              <span className="grow"><b style={{ fontWeight: 600 }}>{c.name}</b><span className="muted">{c.code}</span></span>
              <span className="row" style={{ color: 'var(--exp)', fontWeight: 600, fontSize: 14, gap: 4 }}><Icon name="plus" size={16} />Добавить</span>
            </button>
          ))}
          {!others.length && <div className="muted" style={{ padding: 12 }}>Ничего не нашлось</div>}
        </div>
      </div>
      <div className="muted">Приехал в Испанию — добавь евро и убери лари. Статистика считается в долларах или лари по курсу дня.</div>
    </Sheet>
  );
}
