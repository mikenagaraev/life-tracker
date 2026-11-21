import { useState } from 'react';
import { DaySettingsSheet, DayScreen } from './DayScreen';

/** Отдельное приложение «Трекер дня» (вход /day/). */
export function DayApp() {
  const [settings, setSettings] = useState(false);
  return (
    <>
      <main className="page" style={{ paddingBottom: 40 }}>
        <DayScreen onSettings={() => setSettings(true)} />
      </main>
      {settings && <DaySettingsSheet onClose={() => setSettings(false)} />}
    </>
  );
}
