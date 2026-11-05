import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Heading from '@jetbrains/ring-ui-built/components/heading/heading';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Link from '@jetbrains/ring-ui-built/components/link/link';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import {Header} from '@jetbrains/ring-ui-built/components/island/island';
import Text from '@jetbrains/ring-ui-built/components/text/text';
import chevronLeftIcon from '@jetbrains/icons/chevron-left';
import chevronRightIcon from '@jetbrains/icons/chevron-right';
import newWindowIcon from '@jetbrains/icons/new-window';
import pencilIcon from '@jetbrains/icons/pencil';
import {createApi} from '../common/api';
import {AccountForm} from '../common/account-form';
import {EntryForm} from '../common/entry-form';
import {
  addDays,
  formatDay,
  formatDuration,
  formatShortDate,
  formatTime,
  isSameDay,
  isoWeek,
  startOfWeek
} from '../common/duration';
import {dateKey} from '../common/duration';
import {daysFor} from '../common/calendar';
import {CalendarChips} from '../common/calendar-chips';
import {canEdit} from '../common/editable';
import type {AccountStatus, Calendar, EntryInput, TimeEntry} from '../common/types';
import {t} from '../common/i18n';

const host = await YTApp.register();

const DAYS_PER_WEEK = 7;
const WORKDAYS = 5;

interface DayGroup {
  date: Date;
  entries: TimeEntry[];
  totalSeconds: number;
}

function groupByDay(weekStart: Date, entries: TimeEntry[]): DayGroup[] {
  const days: DayGroup[] = [];
  for (let i = 0; i < DAYS_PER_WEEK; i++) {
    const date = addDays(weekStart, i);
    const dayEntries = entries.filter(entry => isSameDay(new Date(entry.start), date));
    const totalSeconds = dayEntries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
    if (i < WORKDAYS || dayEntries.length > 0) {
      days.push({date, entries: dayEntries, totalSeconds});
    }
  }
  return days;
}

function refLine(entry: TimeEntry): string {
  return ['customer', 'project', 'service']
    .map(key => entry.refs[key]?.name)
    .filter(Boolean)
    .join(' · ');
}

function stripIssueIds(text: string, entry: TimeEntry): string {
  let result = text;
  entry.issues.forEach(issue => {
    result = result.replace(new RegExp(`^${issue.id}[:\\s-]*`), '');
  });
  return result.trim();
}

const EntryRow: React.FC<{entry: TimeEntry; onEdit: ((entry: TimeEntry) => void) | null}> = ({entry, onEdit}) => {
  const start = new Date(entry.start);
  const end = entry.end ? new Date(entry.end) : null;
  const description = stripIssueIds(entry.text, entry);
  return (
    <div className="entry">
      <span className="entry-time ett-muted">
        {end ? `${formatTime(start)} – ${formatTime(end)}` : `${formatTime(start)} – ${t('running')}`}
      </span>
      <span className="entry-duration ett-duration">{formatDuration(entry.durationSeconds)}</span>
      <div className="entry-main">
        <div className="entry-text">
          {entry.issues.map(issue => (
            <Link key={issue.id} href={issue.url} target="_blank" rel="noopener noreferrer" className="entry-issue" title={issue.summary}>
              {issue.id}
            </Link>
          ))}
          <span className="ett-ellipsis">{description || (entry.issues[0]?.summary ?? '—')}</span>
        </div>
        <div className="entry-refs ett-muted ett-small ett-ellipsis">
          {refLine(entry)}
          {entry.billable === false && <span className="entry-flag">{t('notBillable')}</span>}
        </div>
      </div>
      <span className="entry-edit">
        {onEdit && (
          <Button inline icon={pencilIcon} aria-label={t('editEntry')} title={t('editEntry')} onClick={() => onEdit(entry)}/>
        )}
      </span>
    </div>
  );
};

const AppComponent: React.FunctionComponent = () => {
  const api = useMemo(() => createApi(host), []);
  const loadForm = useCallback(() => api.getEntryForm(), [api]);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  useEffect(() => {
    api.getAccount()
      .then(setStatus)
      .catch(e => setError(e instanceof Error ? e.message : t('statusLoadFailed')));
  }, [api]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, nextCalendar] = await Promise.all([
        api.getEntries(weekStart, addDays(weekStart, DAYS_PER_WEEK)),
        api.getCalendar(dateKey(weekStart), dateKey(addDays(weekStart, DAYS_PER_WEEK - 1))).catch(() => null)
      ]);
      setEntries(result.entries);
      setCalendar(nextCalendar);
      if (result.account) {
        const account = result.account;
        setStatus(prev => (prev ? {...prev, account} : prev));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('entriesLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [api, weekStart]);

  useEffect(() => {
    if (status?.account) {
      loadEntries();
    }
  }, [status, loadEntries]);

  const submit = useCallback(async (input: EntryInput) => {
    await api.createEntry(input);
    setDialogOpen(false);
    host.alert(t('entrySaved'));
    const entryWeek = startOfWeek(new Date(input.start));
    if (entryWeek.getTime() === weekStart.getTime()) {
      await loadEntries();
    } else {
      setWeekStart(entryWeek);
    }
  }, [api, loadEntries, weekStart]);

  const submitEdit = useCallback(async (input: EntryInput) => {
    if (!editing) {
      return;
    }
    await api.updateEntry(editing.id, input, editing.text);
    setEditing(null);
    host.alert(t('entryUpdated'));
    await loadEntries();
  }, [api, editing, loadEntries]);

  const days = useMemo(() => groupByDay(weekStart, entries ?? []), [weekStart, entries]);
  const weekTotal = days.reduce((sum, day) => sum + day.totalSeconds, 0);
  const isCurrentWeek = weekStart.getTime() === startOfWeek(new Date()).getTime();
  const weekEnd = addDays(weekStart, DAYS_PER_WEEK - 1);

  if (!status) {
    return (
      <div className="page">
        {error ? <Banner mode="error" withIcon inline>{error}</Banner> : <LoaderInline/>}
      </div>
    );
  }

  if (!status.account) {
    return (
      <div className="page">
        <div className="connect-card">
          <Heading level={Heading.Levels.H3}>{t('connectAccount')}</Heading>
          <Text info>
            {t('connectIntro')}
          </Text>
          <AccountForm api={api} status={status} onChange={setStatus} compact/>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div className="week-nav">
          <Button icon={chevronLeftIcon} aria-label={t('previousWeek')} onClick={() => setWeekStart(addDays(weekStart, -DAYS_PER_WEEK))}/>
          <Button icon={chevronRightIcon} aria-label={t('nextWeek')} onClick={() => setWeekStart(addDays(weekStart, DAYS_PER_WEEK))}/>
          <Button disabled={isCurrentWeek} onClick={() => setWeekStart(startOfWeek(new Date()))}>{t('thisWeek')}</Button>
          <span className="week-label">
            {t('weekLabel', {week: isoWeek(weekStart), from: formatShortDate(weekStart), to: formatShortDate(weekEnd)})}
          </span>
          {loading && <LoaderInline/>}
        </div>
        <div className="toolbar-actions">
          <span className="week-total">
            <span className="ett-muted">{t('weekTotal')}</span>
            <span className="ett-duration">{formatDuration(weekTotal)}</span>
          </span>
          {status.account.links.map(link => (
            <Button key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" icon={newWindowIcon}>
              {link.label}
            </Button>
          ))}
          <Button primary onClick={() => setDialogOpen(true)}>{t('logTime')}</Button>
        </div>
      </div>

      <div className="account-hint ett-muted ett-small">
        {`${status.account.providerName} · ${status.account.name}`}
      </div>

      {error && (
        <Banner mode="error" withIcon inline>
          {error}
          {' '}
          <Button inline onClick={loadEntries}>{t('retry')}</Button>
        </Banner>
      )}

      {entries && (
        <div className="days">
          {days.map(day => (
            <section key={day.date.toISOString()} className={`day ${isSameDay(day.date, new Date()) ? 'day--today' : ''}`}>
              <header className="day-header">
                <span className="day-heading">
                  <span className="day-title">{formatDay(day.date)}</span>
                  <CalendarChips {...daysFor(calendar, dateKey(day.date))}/>
                </span>
                <span className="ett-duration day-total">{day.totalSeconds > 0 ? formatDuration(day.totalSeconds) : '—'}</span>
              </header>
              {day.entries.length === 0
                ? <div className="day-empty ett-muted ett-small">{t('noEntries')}</div>
                : day.entries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={entry.end && canEdit(entry.start, status.account) ? setEditing : null}
                  />
                ))}
            </section>
          ))}
        </div>
      )}

      <Dialog
        show={editing !== null}
        label={t('editTime')}
        trapFocus
        showCloseButton
        onCloseAttempt={() => setEditing(null)}
      >
        <Header>{t('editTime')}</Header>
        {editing && (
          <EntryForm
            key={editing.id}
            api={api}
            defaultText=""
            projectKey={null}
            loadForm={loadForm}
            variant="dialog"
            editEntry={editing}
            submitLabel={t('save')}
            onSubmit={submitEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <Dialog
        show={dialogOpen}
        label={t('logTime')}
        trapFocus
        showCloseButton
        onCloseAttempt={() => setDialogOpen(false)}
      >
        <Header>{t('logTime')}</Header>
        {dialogOpen && (
          <EntryForm
            api={api}
            defaultText=""
            projectKey={null}
            loadForm={loadForm}
            variant="dialog"
            onSubmit={submit}
            onCancel={() => setDialogOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
};

export const App = memo(AppComponent);
