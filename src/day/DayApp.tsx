import { Icon } from '../core/icons';

/** Текущая версия трекера дня (Apps Script). Новая переедет сюда следующим этапом. */
export const DAY_TRACKER_URL = 'https://script.google.com/macros/s/AKfycbw0IPwXuvJGYYixIl4ng-aeE363tKm1RXZ9RFVXRr434U3RTCu3Or0zX07cxkKA5aAm/exec';

export function DayApp() {
  return (
    <main className="page" style={{ paddingBottom: 32 }}>
      <div className="col" style={{ gap: 12, padding: '12px 4px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--day)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <Icon name="check" size={30} stroke={2.4} />
        </div>
        <h1 style={{ fontSize: 30 }}>Трекер дня</h1>
        <p className="muted" style={{ fontSize: 15, margin: 0, lineHeight: 1.45 }}>
          Новый трекер дня в этом дизайне — следующий этап. Пока что отметки ведутся в текущей версии: данные те же, таблица та же.
        </p>
      </div>
      <a className="primary" href={DAY_TRACKER_URL} target="_blank" rel="noreferrer"
        style={{ background: 'var(--day)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
        Открыть трекер дня <Icon name="external" size={18} />
      </a>
      <a className="secondary" href="../finance/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
        Перейти в трекер финансов
      </a>
    </main>
  );
}
