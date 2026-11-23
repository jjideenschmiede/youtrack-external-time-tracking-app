import React from 'react';
import type {AbsenceDay, HolidayDay} from './types';
import {absenceLabel, holidayLabel} from './calendar';
import {t} from './i18n';

export const CalendarChips: React.FC<{
  absences: AbsenceDay[];
  holidays: HolidayDay[];
  onCancel?: (absence: AbsenceDay) => void;
}> = ({absences, holidays, onCancel}) => (
  <>
    {holidays.map(holiday => (
      <span key={`h-${holiday.name}`} className="ett-chip ett-chip--holiday">{holidayLabel(holiday)}</span>
    ))}
    {absences.map(absence => (
      <span
        key={`a-${absence.id}`}
        className={`ett-chip ett-chip--${absence.kind} ${absence.requested ? 'ett-chip--requested' : ''}`}
      >
        {absenceLabel(absence)}
        {onCancel && (
          <button
            type="button"
            className="ett-chip-remove"
            aria-label={t('cancelAbsence')}
            title={t('cancelAbsence')}
            onClick={() => onCancel(absence)}
          >
            {'×'}
          </button>
        )}
      </span>
    ))}
  </>
);
