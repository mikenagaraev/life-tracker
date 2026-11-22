import { useState } from 'react';
import { monthGen, monthName, todayIso } from '../core/format';
import { Seg, Sheet, toast } from '../core/ui';
import { buildXlsx, type Cell } from '../core/xlsx';
import { computeStats, periodRange, shiftAnchor, sortOps, valueIn, type Range } from './logic';
import { useFinance } from './store';
import { TYPE_LABEL, type Op, type Rates } from './types';

type Which = 'month' | 'prev' | 'year' | 'all';

function rangeOf(w: Which, today: string): Range | null {
  if (w === 'month') return periodRange('month', today);
  if (w === 'prev') return periodRange('month', shiftAnchor('month', today, -1));
  if (w === 'year') return periodRange('year', today);
  return null;
}

function title(w: Which, today: string): string {
  const r = rangeOf(w, today);
  if (!r) return 'всё время';
  if (w === 'year') return r.from.slice(0, 4);
  return `${monthName(Number(r.from.slice(5, 7)) - 1).toLowerCase()} ${r.from.slice(0, 4)}`;
}

/** Книга Excel: лист «Записи» и лист «Итоги» (по видам и категориям, в ₾ и $). */
export function financeWorkbook(all: Op[], range: Range | null, rates: Rates | null): Uint8Array {
  const ops = sortOps(all.filter((o) => !o.deleted && (!range || (o.date >= range.from && o.date <= range.to)))).reverse();
  const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  const rows: Cell[][] = [['Дата', 'Время', 'Тип', 'Сумма', 'Валюта', 'Оплата', 'Категория', 'Подкатегория', 'Комментарий', 'Сумма, ₾', 'Сумма, $']];
  for (const o of ops) {
    rows.push([{ date: o.date }, o.time, TYPE_LABEL[o.type], o.amount, o.cur, o.pay, o.cat, o.sub, o.comment, r2(valueIn(o, 'GEL', rates)), r2(valueIn(o, 'USD', rates))]);
  }
  const span = range || { from: ops[0]?.date || todayIso(), to: ops[ops.length - 1]?.date || todayIso() };
  const gel = computeStats(ops, 'month', span, 'GEL', rates), usd = computeStats(ops, 'month', span, 'USD', rates);
  const sum: Cell[][] = [['Вид', 'Категория', '₾', '$']];
  const add = (kind: string, a: typeof gel.expByCat, b: typeof usd.expByCat) => a.forEach((x, i) => sum.push([kind, x.label, r2(x.value), r2(b.find((y) => y.label === x.label)?.value ?? b[i]?.value ?? 0)]));
  sum.push(['Приобретения', 'Всего', r2(gel.expense), r2(usd.expense)]);
  add('Приобретения', gel.expByCat, usd.expByCat);
  sum.push(['Доходы', 'Всего', r2(gel.income), r2(usd.income)]);
  add('Доходы', gel.incByCat, usd.incByCat);
  if (gel.other) sum.push(['Другое', 'Всего', r2(gel.other), r2(usd.other)]);
  sum.push(['Итог', 'Доходы − приобретения', r2(gel.income - gel.expense), r2(usd.income - usd.expense)]);
  return buildXlsx([
    { name: 'Записи', rows, widths: [11, 7, 14, 10, 8, 8, 18, 24, 32, 11, 11] },
    { name: 'Итоги', rows: sum, widths: [14, 26, 12, 12] },
  ]);
}

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const ops = useFinance((s) => s.ops);
  const rates = useFinance((s) => s.rates);
  const [which, setWhich] = useState<Which>('month');
  const [file, setFile] = useState<File | null>(null);
  const today = todayIso();
  const range = rangeOf(which, today);
  const count = Object.values(ops).filter((o) => !o.deleted && (!range || (o.date >= range.from && o.date <= range.to))).length;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

  function make() {
    const data = financeWorkbook(Object.values(ops), range, rates);
    const name = `Финансы — ${title(which, today)}.xlsx`;
    setFile(new File([data as BlobPart], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function share() {
    if (!file) return;
    if (!navigator.canShare({ files: [file] })) return toast('Этот браузер не умеет отправлять файлы — нажми «Скачать»');
    navigator.share({ files: [file], title: file.name }).catch((e) => { if (e?.name !== 'AbortError') toast('Не получилось — нажми «Скачать»'); });
  }

  return (
    <Sheet title="Выгрузить в Excel" onClose={onClose}>
      <Seg<Which> small label="Период выгрузки" value={which} onChange={(v) => { setWhich(v); setFile(null); }}
        items={[{ key: 'month', label: 'Этот месяц' }, { key: 'prev', label: 'Прошлый' }, { key: 'year', label: 'Год' }, { key: 'all', label: 'Всё' }]} />
      <div className="muted">
        {range ? `${Number(range.from.slice(8))} ${monthGen(Number(range.from.slice(5, 7)) - 1)} — ${Number(range.to.slice(8))} ${monthGen(Number(range.to.slice(5, 7)) - 1)} ${range.to.slice(0, 4)}` : 'Все записи'} · записей: {count}.
        Два листа: все записи (суммы и в ₾, и в $ по курсу дня) и итоги по категориям.
      </div>
      {file ? (
        <div className="col" style={{ gap: 8, padding: 12, borderRadius: 14, background: 'var(--ok-bg)' }}>
          <div style={{ color: 'var(--ok)', fontWeight: 600, fontSize: 14 }}>Файл готов · {file.name}</div>
          <div className="wrap" style={{ gap: 6 }}>
            {canShare && <button type="button" className="chip on" onClick={share}>Поделиться…</button>}
            <button type="button" className="chip" onClick={download}>Скачать</button>
          </div>
        </div>
      ) : (
        <button type="button" className="primary" disabled={!count} onClick={make}>{count ? 'Сделать файл' : 'За этот период записей нет'}</button>
      )}
      <div className="muted">Файл собирается на телефоне — работает и без интернета.</div>
    </Sheet>
  );
}
