import { describe, expect, it } from 'vitest';
import { buildXlsx, crc32, excelDate } from './xlsx';

describe('xlsx', () => {
  it('crc32 и даты Excel', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(excelDate('1900-03-01')).toBe(61);
    expect(excelDate('2026-11-22')).toBe(46348);
  });
  it('собирает zip с листами', () => {
    const z = buildXlsx([{ name: 'Записи', rows: [['Дата', 'Сумма'], [{ date: '2026-11-22' }, 12.5], ['<&>', null]] }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50); // локальный заголовок
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50); // конец каталога
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(6); // 5 служебных + 1 лист
    const text = new TextDecoder().decode(z);
    expect(text).toContain('<sheet name="Записи"');
    expect(text).toContain('<c r="A2" s="2"><v>46348</v></c>');
    expect(text).toContain('&lt;&amp;&gt;');
  });
});
