import type {AbsenceDay, Calendar, HolidayDay} from './types';
import {t} from './i18n';

export function absenceLabel(absence: AbsenceDay): string {
  let label = absence.halfDay ? t('halfDay', {label: absence.label}) : absence.label;
  if (absence.requested) {
    label = t('requested', {label});
  }
  return label;
}

export function holidayLabel(holiday: HolidayDay): string {
  const label = t('holiday', {name: holiday.name});
  return holiday.halfDay ? t('halfDay', {label}) : label;
}

export function daysFor(calendar: Calendar | null, key: string) {
  return {
    absences: calendar ? calendar.absences.filter(absence => absence.date === key) : [],
    holidays: calendar ? calendar.holidays.filter(holiday => holiday.date === key) : []
  };
}
