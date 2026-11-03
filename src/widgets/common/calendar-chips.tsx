import React from 'react';
import type {AbsenceDay, HolidayDay} from './types';
import {absenceLabel, holidayLabel} from './calendar';

export const CalendarChips: React.FC<{absences: AbsenceDay[]; holidays: HolidayDay[]}> = ({absences, holidays}) => (
  <>
    {holidays.map(holiday => (
      <span key={`h-${holiday.name}`} className="ett-chip ett-chip--holiday">{holidayLabel(holiday)}</span>
    ))}
    {absences.map(absence => (
      <span
        key={`a-${absence.label}-${absence.requested}`}
        className={`ett-chip ett-chip--${absence.kind} ${absence.requested ? 'ett-chip--requested' : ''}`}
      >
        {absenceLabel(absence)}
      </span>
    ))}
  </>
);
