import React, {useCallback, useEffect, useMemo, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size as InputSize} from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import {Content} from '@jetbrains/ring-ui-built/components/island/island';
import type {Api} from './api';
import {submitOnEnter} from './keyboard';
import type {Calendar, EditableEntry, EntryField, EntryForm as EntryFormSchema, EntryInput, Option} from './types';
import {absenceLabel, daysFor} from './calendar';
import {dateKey, formatDuration, formatTime, isSameDay, parseClockTime, parseDuration, startOfDay} from './duration';
import {dateFnsLocale, t} from './i18n';

interface OptionItem {
  key: string;
  label: string;
  option: Option;
}

const DEFAULT_START_HOUR = 9;
const ROUNDING_MINUTES = 5;

function toItem(option: Option): OptionItem {
  return {key: option.id, label: option.label, option};
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function suggestStart(date: Date, durationSeconds: number | null): string {
  const now = new Date();
  if (!isSameDay(date, now)) {
    return `${pad(DEFAULT_START_HOUR)}:00`;
  }
  const start = new Date(now.getTime() - (durationSeconds ?? 0) * 1000);
  const minutes = Math.floor(start.getMinutes() / ROUNDING_MINUTES) * ROUNDING_MINUTES;
  if (!isSameDay(start, now)) {
    return '00:00';
  }
  return `${pad(start.getHours())}:${pad(minutes)}`;
}

function initialSelection(schema: EntryFormSchema): Record<string, OptionItem | null> {
  const initial: Record<string, OptionItem | null> = {};
  schema.fields.forEach(field => {
    const preset = schema.defaults.refs[field.key];
    initial[field.key] = preset ? toItem(preset) : null;
  });
  return initial;
}

function editSelection(entry: EditableEntry): Record<string, OptionItem | null> {
  const selection: Record<string, OptionItem | null> = {};
  Object.keys(entry.refs).forEach(key => {
    const ref = entry.refs[key];
    selection[key] = ref ? toItem({id: ref.id, label: ref.name}) : null;
  });
  return selection;
}

function collectLabels(selection: Record<string, OptionItem | null>): Record<string, string> {
  const labels: Record<string, string> = {};
  Object.keys(selection).forEach(key => {
    const item = selection[key];
    if (item) {
      labels[key] = item.label;
    }
  });
  return labels;
}

function collectRefs(selection: Record<string, OptionItem | null>): Record<string, string | null> {
  const refs: Record<string, string | null> = {};
  Object.keys(selection).forEach(key => {
    refs[key] = selection[key]?.key ?? null;
  });
  return refs;
}

const RefSelect: React.FC<{
  api: Api;
  field: EntryField;
  parentValue: string | null;
  allRefs: Record<string, string | null>;
  selected: OptionItem | null;
  mappedFrom: string | null;
  onSelect: (item: OptionItem | null) => void;
}> = ({api, field, parentValue, allRefs, selected, mappedFrom, onSelect}) => {
  const [items, setItems] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = field.dependsOn !== null && !parentValue;

  useEffect(() => {
    if (blocked) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query: Record<string, string | null> = {};
    if (field.dependsOn) {
      query[field.dependsOn] = allRefs[field.dependsOn] ?? null;
    }
    api.getOptions(field.key, query)
      .then(result => {
        if (!cancelled) {
          setItems(result.options.map(toItem));
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('optionsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the parent selection changes
  }, [api, field.key, field.dependsOn, parentValue, blocked]);

  return (
    <div className="ett-field">
      <Select<OptionItem>
        label={field.required ? field.label : t('optional', {label: field.label})}
        selectedLabel={field.label}
        data={items}
        selected={selected}
        filter
        clear={!field.required}
        loading={loading}
        disabled={blocked}
        notFoundMessage={loading ? t('loading') : t('nothingFound')}
        onSelect={item => onSelect(item)}
        size={Select.Size.FULL}
      />
      {mappedFrom && selected && <div className="ett-hint-mapped">{t('mappedFrom', {field: mappedFrom})}</div>}
      {error && <div className="ett-field-error">{error}</div>}
    </div>
  );
};

export const EntryForm: React.FC<{
  api: Api;
  defaultText: string;
  projectKey: string | null;
  loadForm: () => Promise<EntryFormSchema>;
  submitLabel?: string;
  onSubmit: (input: EntryInput) => Promise<void>;
  onCancel?: () => void;
  variant?: 'inline' | 'dialog';
  initialSchema?: EntryFormSchema | null;
  editEntry?: EditableEntry | null;
}> = ({api, defaultText, projectKey, loadForm, submitLabel, onSubmit, onCancel, variant = 'inline', initialSchema = null, editEntry = null}) => {
  const [schema, setSchema] = useState<EntryFormSchema | null>(initialSchema);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [date, setDate] = useState<Date>(() => startOfDay(editEntry ? new Date(editEntry.start) : new Date()));
  const [durationInput, setDurationInput] = useState(() => (editEntry ? formatDuration(editEntry.durationSeconds) : ''));
  const [startInput, setStartInput] = useState(() => (editEntry ? formatTime(new Date(editEntry.start)) : ''));
  const [startTouched, setStartTouched] = useState(!!editEntry);
  const [text, setText] = useState(editEntry ? editEntry.text : defaultText);
  const [billable, setBillable] = useState(() => {
    if (editEntry) {
      return editEntry.billable !== false;
    }
    return initialSchema ? initialSchema.defaults.billable : true;
  });
  const [selection, setSelection] = useState<Record<string, OptionItem | null>>(() => {
    if (editEntry) {
      return editSelection(editEntry);
    }
    return initialSchema ? initialSelection(initialSchema) : {};
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [dayCalendar, setDayCalendar] = useState<Calendar | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = dateKey(date);
    setDayCalendar(null);
    api.getCalendar(key, key)
      .then(result => {
        if (!cancelled) {
          setDayCalendar(result);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, date]);

  useEffect(() => {
    if (initialSchema) {
      return undefined;
    }
    let cancelled = false;
    loadForm()
      .then(result => {
        if (cancelled) {
          return;
        }
        if (!editEntry) {
          setSelection(initialSelection(result));
          setBillable(result.defaults.billable);
        }
        setSchema(result);
      })
      .catch(e => {
        if (!cancelled) {
          setSchemaError(e instanceof Error ? e.message : t('formLoadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadForm, initialSchema, editEntry]);

  const durationSeconds = useMemo(() => parseDuration(durationInput), [durationInput]);
  const effectiveStart = startTouched ? startInput : suggestStart(date, durationSeconds);
  const startClock = parseClockTime(effectiveStart);

  const range = useMemo(() => {
    if (!startClock || !durationSeconds) {
      return null;
    }
    const start = new Date(date);
    start.setHours(startClock.hours, startClock.minutes, 0, 0);
    const end = new Date(start.getTime() + durationSeconds * 1000);
    return {start, end};
  }, [date, startClock, durationSeconds]);

  const selectedDay = daysFor(dayCalendar, dateKey(date));
  const refs = collectRefs(selection);
  const missingRefs = schema ? schema.fields.filter(field => field.required && !refs[field.key]) : [];
  const futureEnd = range !== null && range.end.getTime() > Date.now() + 60000;

  let durationError: string | null = null;
  if (showErrors && !durationSeconds) {
    durationError = durationInput.trim()
      ? t('durationUnknown')
      : t('durationMissing');
  }
  const startError = !startClock ? t('startInvalid') : null;

  const selectRef = useCallback((field: EntryField, item: OptionItem | null) => {
    if (!schema) {
      return;
    }
    setSelection(prev => {
      const next = {...prev, [field.key]: item};
      schema.fields.forEach(child => {
        if (child.dependsOn === field.key) {
          next[child.key] = null;
        }
      });
      return next;
    });
  }, [schema]);

  const submit = async () => {
    setShowErrors(true);
    if (!schema || !range || missingRefs.length > 0 || !text.trim()) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        text: text.trim(),
        billable: schema.supportsBillable ? billable : false,
        refs,
        labels: collectLabels(selection),
        projectKey
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const frame = (body: React.ReactNode, actions: React.ReactNode) => {
    if (variant === 'dialog') {
      return (
        <>
          <Content><div className="ett-form ett-dialog-body">{body}</div></Content>
          {actions && <Panel>{actions}</Panel>}
        </>
      );
    }
    return (
      <div className="ett-form">
        {body}
        {actions && <div className="ett-actions">{actions}</div>}
      </div>
    );
  };

  const cancelButton = onCancel ? <Button onClick={onCancel} disabled={submitting}>{t('cancel')}</Button> : null;

  if (schemaError) {
    return frame(<Banner mode="error" withIcon inline>{schemaError}</Banner>, cancelButton);
  }

  if (!schema) {
    return frame(<div className="ett-centered"><LoaderInline/></div>, null);
  }

  return frame(
    <>
      <div className="ett-row">
        <div className="ett-field ett-field--grow">
          <span className="ett-label">{t('date')}</span>
          <DatePicker
            locale={dateFnsLocale}
            date={date}
            onChange={(value: Date | null | undefined) => {
              if (value) {
                setDate(startOfDay(value));
              }
            }}
            size={InputSize.FULL}
          />
        </div>
      </div>

      <div className="ett-row">
        <Input
          className="ett-field--grow"
          label={t('duration')}
          placeholder="1h 30m"
          value={durationInput}
          autoFocus
          size={InputSize.FULL}
          error={durationError}
          onKeyDown={event => submitOnEnter(event, submit)}
          onChange={e => setDurationInput(e.target.value)}
        />
        <Input
          className="ett-field--time"
          label={t('start')}
          placeholder="09:00"
          value={effectiveStart}
          size={InputSize.FULL}
          error={startError}
          onKeyDown={event => submitOnEnter(event, submit)}
          onChange={e => {
            setStartTouched(true);
            setStartInput(e.target.value);
          }}
        />
      </div>

      {selectedDay.holidays.map(holiday => (
        <Banner key={`h-${holiday.name}`} mode="info" withIcon inline>
          {t('holidayOnDay', {name: holiday.name})}
        </Banner>
      ))}
      {selectedDay.absences.map(absence => (
        <Banner key={`a-${absence.label}`} mode="warning" withIcon inline>
          {t('absentOnDay', {label: absenceLabel(absence), provider: schema.providerName})}
        </Banner>
      ))}

      {range && (
        <div className="ett-hint">
          {`${formatTime(range.start)} – ${formatTime(range.end)} · ${formatDuration(durationSeconds ?? 0)}`}
          {futureEnd && <span className="ett-hint-warning">{t('endsInFuture')}</span>}
        </div>
      )}

      {schema.warnings?.map(warning => (
        <Banner key={warning} mode="warning" withIcon inline>{warning}</Banner>
      ))}

      {schema.fields.map(field => (
        <div key={field.key}>
          <RefSelect
            api={api}
            field={field}
            parentValue={field.dependsOn ? refs[field.dependsOn] ?? null : null}
            allRefs={refs}
            selected={selection[field.key] ?? null}
            mappedFrom={schema.mappedFields?.[field.key] ?? null}
            onSelect={item => selectRef(field, item)}
          />
          {showErrors && field.required && !refs[field.key] && (
            <div className="ett-field-error">{t('required', {label: field.label})}</div>
          )}
        </div>
      ))}

      <Input
        label={t('description')}
        multiline
        inputClassName="ett-description"
        value={text}
        size={InputSize.FULL}
        error={showErrors && !text.trim() ? t('descriptionMissing') : null}
        onChange={e => setText(e.target.value)}
      />

      {schema.supportsBillable && (
        <Checkbox label={t('billable')} checked={billable} onChange={e => setBillable(e.target.checked)}/>
      )}

      {submitError && <Banner mode="error" withIcon inline>{submitError}</Banner>}
    </>,
    <>
      <Button primary onClick={submit} loader={submitting} disabled={submitting}>
        {submitLabel ?? t('logIn', {provider: schema.providerName})}
      </Button>
      {cancelButton}
    </>
  );
};
