import { useState, type ReactElement } from 'react';
import type { Conn } from '../core/api';
import { Icon } from '../core/icons';
import { Seg, Sheet, toast } from '../core/ui';
import { uid } from '../core/format';
import { TYPE_UI } from './components';
import { currency } from './data';
import { addCat, children, moveCat, nameTaken, renameCat, toggleHidden } from './logic';
import { pendingCount, useFinance } from './store';
import type { CatNode, OpType } from './types';

/** Подключение к таблице: адрес развертывания Apps Script + секретный ключ. */
export function ConnectForm({ onDone }: { onDone?: () => void }) {
  const conn = useFinance((s) => s.conn);
  const setConn = useFinance((s) => s.setConn);
  const net = useFinance((s) => s.net);
  const error = useFinance((s) => s.error);
  const [url, setUrl] = useState(conn?.url || '');
  const [token, setToken] = useState(conn?.token || '');
  const [busy, setBusy] = useState(false);

  async function connect() {
    const c: Conn = { url: url.trim(), token: token.trim() };
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(c.url)) return toast('Ссылка должна выглядеть как https://script.google.com/macros/s/…/exec');
    if (!c.token) return toast('Вставь ключ');
    setBusy(true);
    await setConn(c);
    setBusy(false);
    const s = useFinance.getState();
    if (s.net === 'idle') {
      toast('✓ Подключено');
      onDone?.();
    }
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <label className="col" style={{ gap: 6 }}>
        <span className="label">Ссылка на скрипт таблицы</span>
        <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" autoCorrect="off" />
      </label>
      <label className="col" style={{ gap: 6 }}>
        <span className="label">Ключ</span>
        <input className="field" value={token} onChange={(e) => setToken(e.target.value)} type="password" autoCapitalize="off" autoCorrect="off" />
      </label>
      {(net === 'auth' || net === 'error') && error && <div className="banner err"><Icon name="alert" size={20} /><div>{error}</div></div>}
      <button type="button" className="primary" disabled={busy} onClick={connect}>{busy ? 'Проверяю…' : 'Подключить'}</button>
      <div className="muted">Проще всего открыть на телефоне ссылку-приглашение — она заполнит оба поля сама.</div>
    </div>
  );
}

export function SetupScreen() {
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="col" style={{ gap: 12, padding: '12px 4px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--exp)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <Icon name="chart" size={30} />
        </div>
        <h1 style={{ fontSize: 30 }}>Трекер финансов</h1>
        <p className="muted" style={{ fontSize: 15, margin: 0, lineHeight: 1.45 }}>
          Записываешь трату за 5 секунд — строка появляется в твоей Google Таблице «Финансы». Без интернета тоже работает.
        </p>
      </div>
      <div className="card"><h2>Подключить таблицу</h2><ConnectForm /></div>
      <div className="card">
        <h2>На экран «Домой»</h2>
        <div className="muted" style={{ fontSize: 14 }}>В Safari: <b>Поделиться</b> → <b>На экран «Домой»</b>. Откроется как обычное приложение, без адресной строки.</div>
      </div>
    </div>
  );
}

/** Дерево категорий: добавить, переименовать, скрыть, поменять порядок. */
export function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const cats = useFinance((s) => s.cats);
  const setCats = useFinance((s) => s.setCats);
  const [type, setType] = useState<OpType>('exp');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ id: string | null; parent: string | null; text: string } | null>(null);

  function commit() {
    if (!edit) return;
    const name = edit.text.trim();
    if (!name) return setEdit(null);
    const node = edit.id ? cats.find((c) => c.id === edit.id) : undefined;
    const parent = node ? node.parent : edit.parent;
    if (nameTaken(cats, type, parent, name, edit.id || undefined)) return toast('Такое название здесь уже есть');
    if (edit.id) setCats(renameCat(cats, edit.id, name));
    else {
      setCats(addCat(cats, type, edit.parent, name, uid('c')));
      if (edit.parent) setOpen((o) => new Set(o).add(edit.parent!));
    }
    setEdit(null);
  }

  const editor = (
    <div className="inline-add" style={{ flex: 1 }}>
      <input className="field" autoFocus value={edit?.text || ''} aria-label="Название"
        onChange={(e) => setEdit((x) => x && { ...x, text: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(null); }} />
      <button type="button" style={{ background: TYPE_UI[type].color }} onClick={commit}>OK</button>
    </div>
  );

  function rows(parent: string | null, depth: number): ReactElement[] {
    const out: ReactElement[] = [];
    for (const n of children(cats, parent, parent ? undefined : type, true)) out.push(...row(n, depth));
    if (edit && !edit.id && edit.parent === parent) {
      out.push(<div key={`new-${parent}`} className="tree-row" style={{ paddingLeft: 12 + depth * 20 }}>{editor}</div>);
    }
    return out;
  }

  function row(n: CatNode, depth: number): ReactElement[] {
    const kids = children(cats, n.id, undefined, true);
    const isOpen = open.has(n.id);
    const out = [
      <div key={n.id} className={'tree-row' + (n.hidden ? ' hidden-cat' : '')} style={{ paddingLeft: 8 + depth * 20 }}>
        {edit?.id === n.id ? editor : (
          <>
            <button type="button" className="icon-btn" style={{ width: 32 }} disabled={!kids.length} aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
              onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; })}>
              {kids.length ? <Icon name={isOpen ? 'chevDown' : 'chevRight'} size={16} stroke={2.4} /> : null}
            </button>
            <button type="button" className="tree-name" style={{ fontWeight: depth ? 500 : 700 }} onClick={() => setEdit({ id: n.id, parent: n.parent, text: n.name })}>
              {n.name}{kids.length ? <span className="muted"> · {kids.length}</span> : null}
            </button>
            <button type="button" className="icon-btn" style={{ width: 36 }} aria-label={`Выше: ${n.name}`} onClick={() => setCats(moveCat(cats, n.id, -1))}><Icon name="up" size={18} /></button>
            <button type="button" className="icon-btn" style={{ width: 36 }} aria-label={`Ниже: ${n.name}`} onClick={() => setCats(moveCat(cats, n.id, 1))}><Icon name="down" size={18} /></button>
            <button type="button" className="icon-btn" style={{ width: 36 }} aria-label={n.hidden ? `Показать: ${n.name}` : `Скрыть: ${n.name}`} onClick={() => setCats(toggleHidden(cats, n.id))}>
              <Icon name={n.hidden ? 'eyeOff' : 'eye'} size={18} />
            </button>
            <button type="button" className="icon-btn" style={{ width: 36 }} aria-label={`Подкатегория в «${n.name}»`} onClick={() => setEdit({ id: null, parent: n.id, text: '' })}><Icon name="plus" size={18} /></button>
          </>
        )}
      </div>,
    ];
    if (isOpen || (edit && !edit.id && edit.parent === n.id)) out.push(...rows(n.id, depth + 1));
    return out;
  }

  return (
    <Sheet title="Категории" full onClose={onClose}>
      <Seg<OpType> label="Тип" value={type} onChange={(t) => { setType(t); setEdit(null); }} cols="1.45fr 1fr 1fr"
        items={(['exp', 'inc', 'oth'] as OpType[]).map((t) => ({ key: t, label: t === 'exp' ? 'Приобретения' : t === 'inc' ? 'Доходы' : 'Другое', color: TYPE_UI[t].color }))} />
      <div className="card flush">{rows(null, 0)}</div>
      <button type="button" className="primary" style={{ background: 'var(--ink)', color: 'var(--bg)' }} onClick={() => setEdit({ id: null, parent: null, text: '' })}>+ Новая категория</button>
      <div className="muted">Нажми на название, чтобы переименовать. Вложенность любая. Скрытая категория пропадает из кнопок, но остаётся в старых записях и статистике.</div>
    </Sheet>
  );
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const conn = useFinance((s) => s.conn);
  const mine = useFinance((s) => s.settings.mine);
  const lastSync = useFinance((s) => s.lastSync);
  const n = useFinance(pendingCount);
  const sync = useFinance((s) => s.sync);
  const [cats, setCats] = useState(false);
  const [reconnect, setReconnect] = useState(false);
  return (
    <Sheet title="Настройки" full onClose={onClose}>
      <div className="card">
        <h2>Таблица</h2>
        <div className="muted">
          {conn ? 'Подключено к Google Таблице «Финансы».' : 'Не подключено.'}{' '}
          {lastSync ? `Последняя синхронизация: ${new Date(lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : ''}
          {n ? ` Ждут отправки: ${n}.` : ''}
        </div>
        <button type="button" className="secondary" onClick={() => void sync()}>Синхронизировать сейчас</button>
        {reconnect || !conn ? <ConnectForm onDone={() => setReconnect(false)} /> : <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setReconnect(true)}>Изменить подключение</button>}
      </div>
      <div className="card">
        <h2>Мои валюты</h2>
        <div className="muted">{mine.map((c) => `${currency(c).sym} ${currency(c).name}`).join(' · ')}</div>
        <div className="muted">Добавить или убрать — кнопка валюты рядом с суммой.</div>
      </div>
      <button type="button" className="secondary" onClick={() => setCats(true)}>Категории и подкатегории</button>
      <div className="muted" style={{ textAlign: 'center' }}>Трекер финансов · версия {__APP_VERSION__}</div>
      {cats && <CategoriesSheet onClose={() => setCats(false)} />}
    </Sheet>
  );
}
