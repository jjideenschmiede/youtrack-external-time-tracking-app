import {locale} from './i18n';

const UNIT_SECONDS: Record<string, number> = {
  h: 3600,
  std: 3600,
  m: 60,
  min: 60
};

const TOKEN_PATTERN = /(\d+(?:[.,]\d+)?)\s*(std|min|h|m)(?![a-z])/g;

function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

export function parseDuration(input: string): number | null {
  const value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }

  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (clock) {
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60;
  }

  if (/^\d+$/.test(value)) {
    const minutes = Number(value);
    return minutes > 0 ? minutes * 60 : null;
  }

  let seconds = 0;
  let consumed = '';
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    seconds += toNumber(match[1]) * UNIT_SECONDS[match[2]];
    consumed += match[0];
  }

  if (consumed.replace(/\s/g, '') !== value.replace(/\s/g, '')) {
    return null;
  }

  const rounded = Math.round(seconds / 60) * 60;
  return rounded > 0 ? rounded : null;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'});
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString(locale, {weekday: 'long', day: '2-digit', month: '2-digit'});
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(locale, {day: '2-digit', month: '2-digit', year: 'numeric'});
}

export function parseClockTime(input: string): {hours: number; minutes: number} | null {
  const match = /^(\d{1,2})(?::?(\d{2}))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return {hours, minutes};
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isoWeek(date: Date): number {
  const target = startOfDay(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

export function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
