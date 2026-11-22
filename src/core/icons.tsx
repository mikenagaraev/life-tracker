const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const PATHS: Record<string, string> = {
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 3.5-3 6v5h3',
  transport: 'M5 17V11l2-5h10l2 5v6zM5 11h14M7 17v3M17 17v3M8 14h1M15 14h1',
  home: 'M4 11l8-7 8 7v9H4zM10 20v-5h4v5',
  travel: circ(12, 12, 9) + 'M3 12h18M12 3c3.5 3.5 3.5 14.5 0 18M12 3c-3.5 3.5-3.5 14.5 0 18',
  leisure: 'M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14 7v10',
  music: 'M9 18V5l11-2v13' + circ(6, 18, 3) + circ(17, 16, 3),
  growth: 'M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2a2 2 0 0 0 2 2h14v-4',
  spirit: 'M12 3c3 4 5 6.5 5 10a5 5 0 0 1-10 0c0-3.5 2-6 5-10z',
  health: 'M3 12h4l2-5 4 10 2-5h6',
  gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10 4 6.5 4 6.5 6S9.5 8 12 8M12 8c2-4 5.5-4 5.5-2S14.5 8 12 8',
  subs: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4',
  finance: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6',
  shop: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  other: circ(6, 12, 1) + circ(12, 12, 1) + circ(18, 12, 1),
  consult: 'M4 5h16v11H9l-5 4z',
  interview: 'M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',
  salary: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  fee: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  bonus: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  exchange: 'M4 8h13l-3-3M20 16H7l3 3',
  transfer: 'M4 7h16v10H4zM4 11h16M15 15h2',
  lend: 'M12 4v12M8 12l4 4 4-4M5 20h14',
  repaid: 'M12 20V8M8 12l4-4 4 4M5 4h14',
  cash: 'M3 6h18v12H3z' + circ(12, 12, 2.5),
  tag: 'M3 12V3h9l9 9-9 9z' + circ(7.5, 7.5, 1.2),
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  list: 'M5 6h14M5 12h14M5 18h9',
  chart: 'M5 20V11M12 20V4M19 20v-6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chevDown: 'M6 9l6 6 6-6',
  chevLeft: 'M15 6l-6 6 6 6',
  chevRight: 'M9 6l6 6-6 6',
  up: 'M6 15l6-6 6 6',
  grip: circ(9, 6, 1) + circ(15, 6, 1) + circ(9, 12, 1) + circ(15, 12, 1) + circ(9, 18, 1) + circ(15, 18, 1),
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13zM15.5 15.5L20 20',
  cloud: 'M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18zM9.5 13.5l2 2 3.5-3.5',
  cloudOff: 'M3 3l18 18M8.5 8.6A6 6 0 0 0 6.5 10 4 4 0 0 0 7 18h10M17.9 12.5A3.5 3.5 0 0 1 19.5 17M10.5 6.2A6 6 0 0 1 18 11.5',
  sync: 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  clock: circ(12, 12, 9) + 'M12 7v5l3 2',
  gear: circ(12, 12, 3) + 'M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1',
  home2: 'M4 11l8-7 8 7v9H4z',
  check: 'M5 12l4 4 10-10',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z' + circ(12, 12, 3),
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  pencil: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
};

export function Icon({ name, size = 20, stroke = 2, color = 'currentColor', label }: { name: string; size?: number; stroke?: number; color?: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={PATHS[name] || PATHS.tag} />
    </svg>
  );
}
