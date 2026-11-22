import { scaleOf } from './analytics';
import type { Report } from './types';

/** Картинки для PDF сводки (сервер вставляет их как есть): тренд периода и рисунки дня. Как в полной версии. */

const BG = '#F6F3EE', INK = '#161616';

function canvas(W: number, H: number) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  return { cv, g };
}

export function trendPng(r: Report): string {
  const scale = scaleOf(r.states), days = r.days, withCounts = !!r.filter;
  const n = scale.length, W = 760, rowH = 36, padT = 18, padB = 40, padL = 190, padR = 22;
  const H = padT + (n - 1) * rowH + padB;
  const { cv, g } = canvas(W, H);
  const y = (v: number) => padT + (n - 1 - v) * rowH;
  const step = days.length > 1 ? (W - padL - padR) / (days.length - 1) : 0;
  const x = (i: number) => padL + i * step;
  g.font = '19px Manrope, Arial, sans-serif'; g.textBaseline = 'middle';
  const diamond = (cx: number, cy: number, rr: number, fill: string) => {
    g.beginPath(); g.moveTo(cx, cy - rr); g.lineTo(cx + rr, cy); g.lineTo(cx, cy + rr); g.lineTo(cx - rr, cy); g.closePath();
    g.fillStyle = fill; g.fill(); g.strokeStyle = 'rgba(22,22,22,.35)'; g.lineWidth = 1; g.stroke();
  };
  scale.forEach((s, v) => {
    g.strokeStyle = 'rgba(22,22,22,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(padL - 6, y(v)); g.lineTo(W - padR / 2, y(v)); g.stroke();
    diamond(14, y(v), 8, s.color); g.fillStyle = 'rgba(22,22,22,.75)'; g.textAlign = 'left'; g.fillText(s.name, 30, y(v));
  });
  if (withCounts) {
    const mx = Math.max(1, ...days.map((d) => d.count || 0)), bh = (n - 1) * rowH * 0.45, bw = Math.max(Math.min(step * 0.5, 26), 6);
    g.font = '15px Manrope, Arial, sans-serif';
    days.forEach((d, i) => {
      if (!d.count) return;
      const hh = (bh * d.count) / mx;
      g.fillStyle = 'rgba(242,194,48,.55)'; g.fillRect(x(i) - bw / 2, padT + (n - 1) * rowH - hh, bw, hh);
      g.fillStyle = 'rgba(22,22,22,.55)'; g.textAlign = 'center'; g.fillText(String(d.count), x(i), padT + (n - 1) * rowH - hh - 10);
    });
    g.font = '19px Manrope, Arial, sans-serif';
  }
  const every = Math.ceil(days.length / 8);
  g.textAlign = 'center'; g.fillStyle = 'rgba(22,22,22,.6)';
  days.forEach((d, i) => { if (i % every === 0 || i === days.length - 1) g.fillText(d.key, x(i), H - 14); });
  g.strokeStyle = INK; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
  let pen = false;
  days.forEach((d, i) => { if (d.level === null) { pen = false; return; } if (pen) g.lineTo(x(i), y(d.level)); else g.moveTo(x(i), y(d.level)); pen = true; });
  g.stroke();
  days.forEach((d, i) => { if (d.level !== null) diamond(x(i), y(d.level), 10, scale[Math.round(d.level)].color); });
  return cv.toDataURL('image/png');
}

interface Stroke { c: string; w: number; p: number[] }

export function strokesPng(json: string, type: 'amp' | 'pic'): string {
  let strokes: Stroke[] = [];
  try { strokes = json ? JSON.parse(json) : []; } catch { strokes = []; }
  if (!Array.isArray(strokes) || !strokes.length) return '';
  const W = 800, H = type === 'amp' ? 240 : 380;
  const { cv, g } = canvas(W, H);
  if (type === 'amp') {
    g.strokeStyle = 'rgba(22,22,22,.14)'; g.lineWidth = 1; g.fillStyle = 'rgba(22,22,22,.5)'; g.font = '13px Manrope, Arial, sans-serif';
    g.setLineDash([5, 5]); g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
    const hours = [6, 9, 12, 15, 18, 21, 24];
    hours.forEach((h, i) => {
      const xx = (i / (hours.length - 1)) * (W - 32) + 16;
      g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H - 18); g.stroke(); g.textAlign = 'center'; g.fillText(h + ':00', xx, H - 4);
    });
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of strokes) {
    g.strokeStyle = s.c === 'ink' ? INK : s.c; g.lineWidth = s.w * 1.4; g.beginPath();
    for (let i = 0; i < s.p.length; i += 2) {
      const xx = (s.p[i] / 1000) * W, yy = (s.p[i + 1] / 1000) * H;
      if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy);
    }
    if (s.p.length === 2) g.lineTo((s.p[0] / 1000) * W + 0.1, (s.p[1] / 1000) * H);
    g.stroke();
  }
  return cv.toDataURL('image/png');
}

/** Все картинки для makeReportPdf: trend, amp:<iso>, pic:<iso>. */
export async function reportImages(r: Report): Promise<Record<string, string>> {
  const img: Record<string, string> = {};
  if (r.days.length > 1 && r.insights.levelDays) img.trend = trendPng(r);
  for (const d of r.days) {
    const a = strokesPng(d.drawings.amp, 'amp'), p = strokesPng(d.drawings.pic, 'pic');
    if (a) img[`amp:${d.iso}`] = a;
    if (p) img[`pic:${d.iso}`] = p;
  }
  return img;
}
