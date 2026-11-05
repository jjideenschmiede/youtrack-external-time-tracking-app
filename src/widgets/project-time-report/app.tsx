import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Link from '@jetbrains/ring-ui-built/components/link/link';
import chevronLeftIcon from '@jetbrains/icons/chevron-left';
import chevronRightIcon from '@jetbrains/icons/chevron-right';
import downloadIcon from '@jetbrains/icons/download';
import {createApi} from '../common/api';
import {addDays, dateKey, formatDuration, formatShortDate, isoWeek, startOfDay, startOfWeek} from '../common/duration';
import type {ProjectReportEntry} from '../common/types';
import {lang, locale, t} from '../common/i18n';
import type {MessageKey} from '../common/i18n';

const host = await YTApp.register();

const DAYS_PER_WEEK = 7;
const ENTRY_LIMIT = 25;

type Period = 'week' | 'month';
type GroupKey = 'issue' | 'user' | 'customer' | 'project' | 'service';

const GROUPS: {key: GroupKey; label: MessageKey}[] = [
  {key: 'issue', label: 'reportByIssue'},
  {key: 'user', label: 'reportByUser'},
  {key: 'customer', label: 'reportByCustomer'},
  {key: 'project', label: 'reportByProject'},
  {key: 'service', label: 'reportByService'}
];

interface Group {
  key: string;
  label: string;
  detail: string | null;
  url: string | null;
  estimateSeconds?: number | null;
  seconds: number;
  count: number;
}

function periodStart(period: Period, date: Date): Date {
  return period === 'week' ? startOfWeek(date) : new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftPeriod(period: Period, start: Date, steps: number): Date {
  return period === 'week'
    ? addDays(start, steps * DAYS_PER_WEEK)
    : new Date(start.getFullYear(), start.getMonth() + steps, 1);
}

function periodLabel(period: Period, start: Date): string {
  if (period === 'month') {
    return start.toLocaleDateString(locale, {month: 'long', year: 'numeric'});
  }
  const end = addDays(start, DAYS_PER_WEEK - 1);
  return t('weekLabel', {week: isoWeek(start), from: formatShortDate(start), to: formatShortDate(end)});
}

function groupIdentity(entry: ProjectReportEntry, key: GroupKey): Omit<Group, 'seconds' | 'count'> {
  if (key === 'issue') {
    return {key: entry.issue.id, label: entry.issue.id, detail: entry.issue.summary, url: entry.issue.url, estimateSeconds: entry.issue.estimateSeconds};
  }
  if (key === 'user') {
    return {key: entry.userLogin, label: entry.userName || entry.userLogin, detail: null, url: null};
  }
  const ref = entry.refs[key];
  return ref
    ? {key: ref.id, label: ref.name, detail: null, url: null}
    : {key: '', label: t('reportNone'), detail: null, url: null};
}

function groupEntries(entries: ProjectReportEntry[], key: GroupKey): Group[] {
  const groups = new Map<string, Group>();
  entries.forEach(entry => {
    const identity = groupIdentity(entry, key);
    const group = groups.get(identity.key) ?? {...identity, seconds: 0, count: 0};
    group.seconds += entry.durationSeconds;
    group.count += 1;
    groups.set(identity.key, group);
  });
  return Array.from(groups.values()).sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label, locale));
}

function csvValue(raw: string, separator: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /["\n\r]/.test(value) || value.includes(separator) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(entries: ProjectReportEntry[], fileName: string) {
  const separator = lang === 'de' ? ';' : ',';
  const header: MessageKey[] = [
    'reportColumnDate', 'reportColumnIssue', 'reportColumnSummary', 'reportColumnUser', 'reportColumnCustomer',
    'reportColumnProject', 'reportColumnService', 'reportColumnDescription', 'reportColumnHours'
  ];
  const hours = new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const rows = entries
    .slice()
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map(entry => [
      dateKey(new Date(entry.start)),
      entry.issue.id,
      entry.issue.summary,
      entry.userName || entry.userLogin,
      entry.refs.customer?.name ?? '',
      entry.refs.project?.name ?? '',
      entry.refs.service?.name ?? '',
      entry.text,
      hours.format(entry.durationSeconds / 3600)
    ]);
  const csv = [header.map(key => t(key)), ...rows]
    .map(row => row.map(value => csvValue(value, separator)).join(separator))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const GroupRow: React.FC<{group: Group; maxSeconds: number}> = ({group, maxSeconds}) => (
  <li className="group">
    <div className="group-main">
      {group.url
        ? <Link href={group.url} target="_blank" rel="noopener noreferrer" className="group-label">{group.label}</Link>
        : <span className={`group-label ${group.key ? '' : 'ett-muted'}`}>{group.label}</span>}
      {group.detail && <span className="ett-ellipsis">{group.detail}</span>}
    </div>
    <span className="ett-muted ett-small group-count">
      {t('reportEntryCount', {count: group.count})}
      {!!group.estimateSeconds && ` · ${t('reportEstimate', {duration: formatDuration(group.estimateSeconds)})}`}
    </span>
    <span className="ett-duration group-duration">{formatDuration(group.seconds)}</span>
    <span className="group-bar" aria-hidden>
      <span className="group-bar-fill" style={{width: `${maxSeconds > 0 ? (group.seconds / maxSeconds) * 100 : 0}%`}}/>
    </span>
  </li>
);

const EntryRow: React.FC<{entry: ProjectReportEntry}> = ({entry}) => {
  const refs = ['customer', 'project', 'service'].map(key => entry.refs[key]?.name).filter(Boolean).join(' · ');
  return (
    <li className="report-entry">
      <span className="ett-muted report-entry-date">{formatShortDate(new Date(entry.start))}</span>
      <span className="ett-duration report-entry-duration">{formatDuration(entry.durationSeconds)}</span>
      <div className="report-entry-main">
        <div className="report-entry-text">
          <Link href={entry.issue.url} target="_blank" rel="noopener noreferrer" className="report-entry-issue" title={entry.issue.summary}>
            {entry.issue.id}
          </Link>
          <span className="ett-ellipsis">{entry.text || entry.issue.summary}</span>
        </div>
        <div className="ett-muted ett-small ett-ellipsis">
          {[entry.mine ? t('me') : entry.userName, refs].filter(Boolean).join(' · ')}
        </div>
      </div>
    </li>
  );
};

const AppComponent: React.FunctionComponent = () => {
  const api = useMemo(() => createApi(host), []);
  const [period, setPeriod] = useState<Period>('month');
  const [start, setStart] = useState<Date>(() => periodStart('month', new Date()));
  const [groupBy, setGroupBy] = useState<GroupKey>('issue');
  const [entries, setEntries] = useState<ProjectReportEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const end = useMemo(() => shiftPeriod(period, start, 1), [period, start]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await api.getProjectReport(start, end);
      setEntries(report.entries);
      setShowAll(false);
      if (report.needsRefs) {
        api.backfillProject(start, end)
          .then(async result => {
            if (result.changed) {
              setEntries((await api.getProjectReport(start, end)).entries);
            }
          })
          .catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('reportLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [api, start, end]);

  useEffect(() => {
    load();
  }, [load]);

  const changePeriod = (next: Period) => {
    setPeriod(next);
    setStart(periodStart(next, new Date()));
  };

  const groups = useMemo(() => groupEntries(entries ?? [], groupBy), [entries, groupBy]);
  const totalSeconds = useMemo(() => (entries ?? []).reduce((sum, entry) => sum + entry.durationSeconds, 0), [entries]);
  const maxSeconds = groups.length > 0 ? groups[0].seconds : 0;
  const isCurrent = start.getTime() === periodStart(period, startOfDay(new Date())).getTime();
  const visibleEntries = entries && !showAll ? entries.slice(0, ENTRY_LIMIT) : entries ?? [];

  return (
    <div className="page">
      <div className="toolbar">
        <div className="week-nav">
          <ButtonGroup>
            <Button active={period === 'week'} onClick={() => changePeriod('week')}>{t('reportWeek')}</Button>
            <Button active={period === 'month'} onClick={() => changePeriod('month')}>{t('reportMonth')}</Button>
          </ButtonGroup>
          <Button icon={chevronLeftIcon} aria-label={t('reportPrevious')} onClick={() => setStart(shiftPeriod(period, start, -1))}/>
          <Button icon={chevronRightIcon} aria-label={t('reportNext')} onClick={() => setStart(shiftPeriod(period, start, 1))}/>
          <Button disabled={isCurrent} onClick={() => setStart(periodStart(period, new Date()))}>
            {period === 'week' ? t('reportCurrentWeek') : t('reportCurrentMonth')}
          </Button>
          <span className="week-label">{periodLabel(period, start)}</span>
          {loading && <LoaderInline/>}
        </div>
        <div className="toolbar-actions">
          <span className="week-total">
            <span className="ett-muted">{t('total')}</span>
            <span className="ett-duration">{formatDuration(totalSeconds)}</span>
          </span>
          <Button
            icon={downloadIcon}
            disabled={!entries || entries.length === 0}
            onClick={() => entries && downloadCsv(entries, `time-report-${dateKey(start)}-${dateKey(addDays(end, -1))}.csv`)}
          >
            {t('reportExport')}
          </Button>
        </div>
      </div>

      <div className="account-hint ett-muted ett-small">{t('reportScopeHint')}</div>

      {error && (
        <Banner mode="error" withIcon inline>
          {error}
          {' '}
          <Button inline onClick={load}>{t('retry')}</Button>
        </Banner>
      )}

      {!entries && !error && <LoaderInline/>}

      {entries && entries.length === 0 && (
        <div className="report-empty ett-muted">{t('reportEmpty')}</div>
      )}

      {entries && entries.length > 0 && (
        <>
          <section className="day">
            <header className="day-header">
              <span className="day-title">{t('reportGroupBy')}</span>
              <ButtonGroup>
                {GROUPS.map(group => (
                  <Button key={group.key} active={groupBy === group.key} onClick={() => setGroupBy(group.key)}>
                    {t(group.label)}
                  </Button>
                ))}
              </ButtonGroup>
            </header>
            <ul className="groups">
              {groups.map(group => <GroupRow key={group.key || 'none'} group={group} maxSeconds={maxSeconds}/>)}
            </ul>
          </section>

          <section className="day">
            <header className="day-header">
              <span className="day-title">{t('reportEntries')}</span>
              <span className="ett-muted">{t('reportEntryCount', {count: entries.length})}</span>
            </header>
            <ul className="report-entries">
              {visibleEntries.map(entry => <EntryRow key={`${entry.issue.id}-${entry.id}`} entry={entry}/>)}
            </ul>
            {entries.length > ENTRY_LIMIT && (
              <div className="report-more">
                <Button inline onClick={() => setShowAll(!showAll)}>
                  {showAll ? t('showLess') : t('showAll', {count: entries.length})}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export const App = memo(AppComponent);
