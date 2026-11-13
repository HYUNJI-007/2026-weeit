import { APP_TIMEZONE, COL } from '../constants';

export function pad2(value: number | string): string {
  return String(value).padStart(2, '0');
}

export function isBlank(value: any): boolean {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  return s === '' || s === 'undefined' || s === 'null';
}

export function isNumberLike(value: any): boolean {
  if (isBlank(value)) return false;
  return !isNaN(Number(String(value).trim()));
}

export function formatDateObj(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;

  return (y && m && d) ? `${y}-${m}-${d}` : '';
}

export function formatTimeObj(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const h = parts.find(p => p.type === 'hour')?.value;
  const m = parts.find(p => p.type === 'minute')?.value;

  return (h && m) ? `${h}:${m}` : '';
}

export function formatSerialDate(serial: number | string): string {
  const num = Number(serial);
  if (isNaN(num)) return '';
  const wholeDays = Math.floor(num);
  const excelEpochUtc = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpochUtc + wholeDays * 86400000);

  if (isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

export function formatSerialTime(serial: number | string): string {
  const num = Number(serial);
  if (isNaN(num)) return '';
  const dayFraction = num - Math.floor(num);
  const totalSeconds = Math.round(dayFraction * 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${pad2(hours)}:${pad2(minutes)}`;
}

export function getTodayLocalStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseMeridiemTime(raw: any): string {
  if (isBlank(raw)) return '';
  const s = String(raw).trim();

  let match = s.match(/(오전|오후)\s*(\d{1,2})(?::(\d{1,2}))?/);
  if (match) {
    let hour = Number(match[2]);
    const min = Number(match[3] || 0);

    if (match[1] === '오후' && hour < 12) hour += 12;
    if (match[1] === '오전' && hour === 12) hour = 0;

    return `${pad2(hour)}:${pad2(min)}`;
  }

  match = s.match(/(\d{1,2})(?::(\d{1,2}))?\s*([AP]M)/i);
  if (match) {
    let hour = Number(match[1]);
    const min = Number(match[2] || 0);
    const meridiem = match[3].toUpperCase();

    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;

    return `${pad2(hour)}:${pad2(min)}`;
  }

  match = s.match(/([AP]M)\s*(\d{1,2})(?::(\d{1,2}))?/i);
  if (match) {
    let hour = Number(match[2]);
    const min = Number(match[3] || 0);
    const meridiem = match[1].toUpperCase();

    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;

    return `${pad2(hour)}:${pad2(min)}`;
  }

  return '';
}

export function cleanDateStr(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDateObj(value);

  const raw = String(value).trim();
  if (!raw || raw === 'undefined' || raw === 'null') return '';

  const hasTimezoneInfo = /Z$|GMT|UTC|[+-]\d{2}:?\d{2}$/i.test(raw);
  if (/[T\s]/.test(raw) && hasTimezoneInfo) {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      return formatDateObj(parsed);
    }
  }

  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    return `${isoDateOnly[1]}-${isoDateOnly[2]}-${isoDateOnly[3]}`;
  }

  const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoLike) {
    return `${isoLike[1]}-${String(isoLike[2]).padStart(2, '0')}-${String(isoLike[3]).padStart(2, '0')}`;
  }

  const dotted = raw.match(/^(\d{2,4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (dotted) {
    let year = dotted[1];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${String(dotted[2]).padStart(2, '0')}-${String(dotted[3]).padStart(2, '0')}`;
  }

  const num = Number(raw);
  if (!isNaN(num) && num >= 1) {
    return formatSerialDate(num);
  }

  return '';
}

export function cleanTimeStr(value: any): string {
  if (isBlank(value)) return '';
  if (value instanceof Date) return formatTimeObj(value);

  const raw = String(value).trim();

  if (isNumberLike(raw)) {
    const num = Number(raw);
    if (num >= 0) return formatSerialTime(num);
    return '';
  }

  const meridiemTime = parseMeridiemTime(raw);
  if (meridiemTime) return meridiemTime;

  if (
    raw.includes(':') &&
    (
      raw.includes('T') ||
      /GMT|UTC|Z$/i.test(raw) ||
      /\d{4}[.\-/]\s*\d{1,2}[.\-/]\s*\d{1,2}/.test(raw)
    )
  ) {
    const normalized = raw.replace('오전', 'AM').replace('오후', 'PM');
    const date = new Date(normalized);
    if (!isNaN(date.getTime())) {
      return formatTimeObj(date);
    }
  }

  const timeMatch = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (timeMatch) {
    return `${pad2(timeMatch[1])}:${pad2(timeMatch[2])}`;
  }

  return '';
}

export function splitDateTime(value: any): { date: string; time: string } {
  if (isBlank(value)) {
    return { date: '', time: '' };
  }
  return {
    date: cleanDateStr(value),
    time: cleanTimeStr(value)
  };
}

export function formatGradeDisplay(value: any): string {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '-';
  if (raw === '해당없음' || raw === '혼합') return raw;
  return raw.includes('학년') ? raw : `${raw}학년`;
}

export function formatNextAppointment(raw: any): string {
  if (isBlank(raw)) return '미정';
  const { date, time } = splitDateTime(raw);
  return [date, time].filter(Boolean).join(' ') || String(raw);
}

export function getRecordDateTimeMs(dateStr: string, timeStr?: string): number {
  const date = cleanDateStr(dateStr);
  const time = cleanTimeStr(timeStr) || '00:00';
  if (!date) return 0;
  const dt = new Date(`${date}T${time}:00`);
  const ms = dt.getTime();
  return isNaN(ms) ? 0 : ms;
}

export function calcCounselTimeParts(startValue: any, endValue: any): { hour: number; min: number } {
  const startStr = cleanTimeStr(startValue || '00:00');
  const endStr = cleanTimeStr(endValue || '00:00');

  const start = startStr.split(':').map(Number);
  const end = endStr.split(':').map(Number);

  let totalMinutes = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
  if (isNaN(totalMinutes) || totalMinutes < 0) totalMinutes = 0;

  return {
    hour: Math.floor(totalMinutes / 60),
    min: totalMinutes % 60
  };
}
