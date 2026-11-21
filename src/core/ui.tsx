import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icon } from './icons';

/* ---------- тосты ---------- */
const useToast = create<{ msg: string; key: number }>(() => ({ msg: '', key: 0 }));
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  clearTimeout(toastTimer);
  useToast.setState({ msg, key: Date.now() });
  toastTimer = setTimeout(() => useToast.setState({ msg: '' }), 2600);
}
export function ToastHost() {
  const msg = useToast((s) => s.msg);
  return msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null;
}

/* ---------- шторка ---------- */
export function Sheet({ title, onClose, children, full }: { title: string; onClose: () => void; children: ReactNode; full?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="between">
          <h2 style={{ fontSize: 19 }}>{title}</h2>
          <button className="icon-btn" style={{ background: 'var(--bg)' }} aria-label="Закрыть" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- сегменты ---------- */
export function Seg<T extends string>({ items, value, onChange, label, cols, small }: {
  items: { key: T; label: string; color?: string }[]; value: T; onChange: (v: T) => void; label: string; cols?: string; small?: boolean;
}) {
  return (
    <div className={'seg' + (small ? ' small' : '')} role="group" aria-label={label} style={{ gridTemplateColumns: cols || `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <button key={it.key} type="button" aria-pressed={it.key === value} className={it.key === value ? 'on' : ''}
          style={it.key === value && it.color ? { color: it.color } : undefined} onClick={() => onChange(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- удаление в два нажатия ---------- */
export function ConfirmButton({ onConfirm, children, className }: { onConfirm: () => void; children: ReactNode; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Точно удалить?' : children}
    </button>
  );
}

/* ---------- нижняя навигация ---------- */
export interface NavItem { key: string; label: string; icon: string; href?: string }
export function BottomNav({ items, value, onChange }: { items: NavItem[]; value: string; onChange: (k: string) => void }) {
  return (
    <nav className="nav" aria-label="Разделы">
      <div className="nav-in" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) =>
          it.href ? (
            <a key={it.key} href={it.href}><Icon name={it.icon} size={22} />{it.label}</a>
          ) : (
            <button key={it.key} type="button" className={it.key === value ? 'on' : ''} aria-current={it.key === value ? 'page' : undefined} onClick={() => onChange(it.key)}>
              <Icon name={it.icon} size={22} />{it.label}
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
