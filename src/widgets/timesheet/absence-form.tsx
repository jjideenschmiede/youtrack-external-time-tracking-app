import React, {useEffect, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size as InputSize} from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import type {AbsenceBalance, AbsenceInput, AbsenceType} from '../common/types';
import {dateKey, startOfDay} from '../common/duration';
import {dateFnsLocale, locale, t} from '../common/i18n';

const MAX_NOTE_LENGTH = 512;

interface TypeItem {
  key: string;
  label: string;
  kind: AbsenceType['kind'];
}

function formatDays(value: number): string {
  return value.toLocaleString(locale, {maximumFractionDigits: 2});
}

export const AbsenceForm: React.FC<{
  types: AbsenceType[];
  providerName: string;
  balances: Record<number, AbsenceBalance>;
  loadBalance: (year: number) => Promise<AbsenceBalance>;
  onSubmit: (input: AbsenceInput) => Promise<void>;
  onCancel: () => void;
}> = ({types, providerName, balances, loadBalance, onSubmit, onCancel}) => {
  const items: TypeItem[] = types.map(type => ({key: type.id, label: type.label, kind: type.kind}));
  const [selected, setSelected] = useState<TypeItem>(items[0]);
  const [from, setFrom] = useState<Date>(() => startOfDay(new Date()));
  const [to, setTo] = useState<Date>(() => startOfDay(new Date()));
  const [halfDay, setHalfDay] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const singleDay = from.getTime() === to.getTime();
  const year = from.getFullYear();
  const vacation = selected.kind === 'vacation';

  const known = balances[year];

  useEffect(() => {
    if (vacation && !known) {
      loadBalance(year).catch(() => undefined);
    }
  }, [loadBalance, vacation, known, year]);

  const shownBalance = known ? known.balance : null;

  const changeFrom = (value: Date) => {
    setFrom(value);
    if (value.getTime() > to.getTime()) {
      setTo(value);
    }
  };

  const changeTo = (value: Date) => {
    setTo(value);
    if (value.getTime() < from.getTime()) {
      setFrom(value);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        type: selected.key,
        fromDate: dateKey(from),
        toDate: dateKey(to),
        halfDay: halfDay && singleDay,
        note: note.trim()
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('absenceSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ett-form">
      <div className="ett-field">
        <Select<TypeItem>
          label={t('absenceType')}
          selectedLabel={t('absenceType')}
          data={items}
          selected={selected}
          onSelect={item => {
            if (item) {
              setSelected(item);
            }
          }}
          size={Select.Size.FULL}
        />
        {vacation && (
          <div className="ett-hint-mapped">
            {shownBalance
              ? t('vacationLeft', {
                remaining: formatDays(shownBalance.remaining),
                total: formatDays(shownBalance.total),
                year
              })
              : '\u00a0'}
          </div>
        )}
      </div>

      <div className="ett-row">
        <div className="ett-field ett-field--grow">
          <span className="ett-label">{t('absenceFrom')}</span>
          <DatePicker
            locale={dateFnsLocale}
            date={from}
            onChange={(value: Date | null | undefined) => {
              if (value) {
                changeFrom(startOfDay(value));
              }
            }}
            size={InputSize.FULL}
          />
        </div>
        <div className="ett-field ett-field--grow">
          <span className="ett-label">{t('absenceTo')}</span>
          <DatePicker
            locale={dateFnsLocale}
            date={to}
            onChange={(value: Date | null | undefined) => {
              if (value) {
                changeTo(startOfDay(value));
              }
            }}
            size={InputSize.FULL}
          />
        </div>
      </div>

      <Checkbox
        label={t('absenceHalfDay')}
        checked={halfDay && singleDay}
        disabled={!singleDay}
        onChange={e => setHalfDay(e.target.checked)}
      />

      <Input
        label={t('absenceNote')}
        multiline
        inputClassName="ett-description"
        value={note}
        size={InputSize.FULL}
        onChange={e => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
      />

      {error && <Banner mode="error" withIcon inline>{error}</Banner>}

      <div className="ett-actions">
        <Button primary onClick={submit} loader={submitting} disabled={submitting}>
          {t('absenceSubmit', {provider: providerName})}
        </Button>
        <Button onClick={onCancel} disabled={submitting}>{t('cancel')}</Button>
      </div>
    </div>
  );
};
