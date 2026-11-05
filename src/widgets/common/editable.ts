import {addDays, dateKey, isSameDay, startOfDay} from './duration';
import type {Account} from './types';

export function canEdit(start: string, account: Account | null | undefined): boolean {
  if (!account) {
    return false;
  }
  const date = new Date(start);
  const lock = account.lock;
  if (!lock || !lock.known) {
    return isSameDay(date, new Date());
  }
  if (lock.unrestricted) {
    return true;
  }
  const day = dateKey(date);
  if (lock.date && day <= lock.date) {
    return false;
  }
  if (lock.days && day < dateKey(addDays(startOfDay(new Date()), 1 - lock.days))) {
    return false;
  }
  return true;
}
