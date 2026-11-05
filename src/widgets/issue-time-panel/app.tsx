import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Tooltip from '@jetbrains/ring-ui-built/components/tooltip/tooltip';
import addIcon from '@jetbrains/icons/add';
import pencilIcon from '@jetbrains/icons/pencil';
import playIcon from '@jetbrains/icons/play';
import stopIcon from '@jetbrains/icons/stop';
import {Elapsed} from '../common/elapsed';
import {createApi} from '../common/api';
import {AccountForm} from '../common/account-form';
import {EntryForm} from '../common/entry-form';
import {TimeDialog} from '../common/time-dialog';
import {formatDuration, formatShortDate} from '../common/duration';
import {loadIssueContext, type IssueContext} from '../common/issue-context';
import {canEdit} from '../common/editable';
import type {AccountStatus, EntryForm as EntryFormSchema, EntryInput, IssueEntry, IssueSummary} from '../common/types';
import {t} from '../common/i18n';

const host = await YTApp.register();

const VISIBLE_ENTRIES = 3;
const REFRESH_INTERVAL = 10 * 60 * 1000;
const REFRESH_WINDOW = 60 * 24 * 3600 * 1000;

const REFRESH_KEY = 'ett-refresh';

async function claimRefresh(issueId: string): Promise<boolean> {
  try {
    const now = Date.now();
    const stored = JSON.parse(await host.storage.getItem(REFRESH_KEY) || '{}') as Record<string, number>;
    if (now - (stored[issueId] || 0) < REFRESH_INTERVAL) {
      return false;
    }
    const kept: Record<string, number> = {[issueId]: now};
    Object.keys(stored).forEach(key => {
      if (now - stored[key] < REFRESH_INTERVAL) {
        kept[key] = stored[key];
      }
    });
    await host.storage.setItem(REFRESH_KEY, JSON.stringify(kept));
  } catch {
    return true;
  }
  return true;
}

function needsRefresh(summary: IssueSummary): boolean {
  const oldest = Date.now() - REFRESH_WINDOW;
  return !!summary.account && summary.entries.some(entry => entry.mine && new Date(entry.start).getTime() >= oldest);
}
const MODAL_REVEAL_FALLBACK_MS = 250;

function waitForResize(): Promise<void> {
  return new Promise(resolve => {
    let fallback = 0;
    const done = () => {
      window.removeEventListener('resize', done);
      window.clearTimeout(fallback);
      requestAnimationFrame(() => resolve());
    };
    fallback = window.setTimeout(done, MODAL_REVEAL_FALLBACK_MS);
    window.addEventListener('resize', done);
  });
}

type Mode = 'view' | 'add' | 'connect';

function dialogTitle(editing: IssueEntry | null, timing: boolean): string {
  if (timing) {
    return t('startClock');
  }
  return editing ? t('editTime') : t('logTime');
}

function submitLabel(editing: IssueEntry | null, timing: boolean): string | undefined {
  if (timing) {
    return t('startClockSubmit');
  }
  return editing ? t('save') : undefined;
}

const EstimateBar: React.FC<{used: number; estimate: number}> = ({used, estimate}) => {
  const percent = Math.round((used / estimate) * 100);
  const over = used > estimate;
  return (
    <div className={`panel-estimate ${over ? 'panel-estimate--over' : ''}`}>
      <span
        className="panel-estimate-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        aria-label={t('estimateUsed', {percent})}
      >
        <span className="panel-estimate-fill" style={{width: `${Math.min(percent, 100)}%`}}/>
      </span>
      <span className="ett-small panel-estimate-text">{t('estimateUsed', {percent})}</span>
    </div>
  );
};

const AppComponent: React.FunctionComponent = () => {
  const api = useMemo(() => createApi(host), []);
  const formRequest = useRef<Promise<EntryFormSchema> | null>(null);
  const loadForm = useCallback(() => {
    if (!formRequest.current) {
      formRequest.current = api.getIssueEntryForm().catch(e => {
        formRequest.current = null;
        throw e;
      });
    }
    return formRequest.current;
  }, [api]);
  const loadPlainForm = useCallback(() => api.getEntryForm(), [api]);
  const [editing, setEditing] = useState<IssueEntry | null>(null);
  const [timing, setTiming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [opening, setOpening] = useState(false);
  const [prefetched, setPrefetched] = useState<EntryFormSchema | null>(null);
  const [modalReady, setModalReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [summary, setSummary] = useState<IssueSummary | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [issue, setIssue] = useState<IssueContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextSummary, nextIssue] = await Promise.all([api.getIssueSummary(), loadIssueContext(host)]);
      setSummary(nextSummary);
      setIssue(nextIssue);
      if (needsRefresh(nextSummary) && await claimRefresh(nextIssue.id)) {
        api.refreshIssue()
          .then(async result => {
            if (result.changed) {
              setSummary(await api.getIssueSummary());
            }
          })
          .catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dataLoadFailed'));
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const openEntry = useCallback(async () => {
    setOpening(true);
    try {
      setPrefetched(await loadForm().catch(() => null));
      setModalReady(false);
      await host.enterModalMode();
      setMode('add');
    } finally {
      setOpening(false);
    }
  }, [loadForm]);

  const openClock = useCallback(async () => {
    setOpening(true);
    try {
      setPrefetched(await loadForm().catch(() => null));
      setTiming(true);
      setModalReady(false);
      await host.enterModalMode();
      setMode('add');
    } finally {
      setOpening(false);
    }
  }, [loadForm]);

  const stopClock = useCallback(async () => {
    setStopping(true);
    try {
      setSummary(await api.stopIssueClock());
      host.alert(t('clockStopped'));
    } catch (e) {
      await api.syncClock().catch(() => undefined);
      setSummary(await api.getIssueSummary());
      host.alert(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setStopping(false);
    }
  }, [api]);

  const openEdit = useCallback(async (entry: IssueEntry) => {
    setOpening(true);
    try {
      setPrefetched(await loadPlainForm().catch(() => null));
      setEditing(entry);
      setModalReady(false);
      await host.enterModalMode();
      setMode('add');
    } finally {
      setOpening(false);
    }
  }, [loadPlainForm]);

  const closeEntry = useCallback(async () => {
    setClosing(true);
    formRequest.current = null;
    const resized = waitForResize();
    await host.exitModalMode();
    await resized;
    setMode('view');
    setEditing(null);
    setTiming(false);
    setClosing(false);
  }, []);

  useEffect(() => {
    if (mode !== 'add' || modalReady) {
      return undefined;
    }
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setModalReady(true));
    };
    const fallback = window.setTimeout(reveal, MODAL_REVEAL_FALLBACK_MS);
    window.addEventListener('resize', reveal);
    return () => {
      window.clearTimeout(fallback);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', reveal);
    };
  }, [mode, modalReady]);

  const startConnect = useCallback(async () => {
    setMode('connect');
    if (!status) {
      try {
        setStatus(await api.getAccount());
      } catch (e) {
        setError(e instanceof Error ? e.message : t('providersLoadFailed'));
      }
    }
  }, [api, status]);

  const submit = useCallback(async (input: EntryInput) => {
    if (timing) {
      setSummary(await api.startIssueClock(input));
      await closeEntry();
      host.alert(t('clockStarted'));
      return;
    }
    if (editing) {
      const updated = await api.updateIssueEntry(editing.id, input);
      setSummary(updated);
      await closeEntry();
      host.alert(t('entryUpdated'));
      return;
    }
    const next = await api.createIssueEntry(input);
    setSummary(next);
    await closeEntry();
    const duration = formatDuration((new Date(input.end).getTime() - new Date(input.start).getTime()) / 1000);
    host.alert(t('loggedIn', {duration, provider: next.account?.providerName ?? ''}));
  }, [api, closeEntry, editing, timing]);

  if (error) {
    return (
      <div className="panel">
        <Banner mode="error" withIcon inline>{error}</Banner>
        <div className="ett-actions"><Button inline onClick={load}>{t('retry')}</Button></div>
      </div>
    );
  }

  if (!summary || !issue) {
    return <div className="panel"><LoaderInline/></div>;
  }

  const account = summary.account;
  const clock = summary.clock ?? null;
  const clockHere = !!clock && clock.issueId === issue.id;
  const entries = expanded ? summary.entries : summary.entries.slice(0, VISIBLE_ENTRIES);

  return (
    <div className={`panel ${mode === 'add' ? 'panel--modal' : ''}`}>
      {account && (
        <div className="panel-header">
          <span className="panel-title">{account.providerName}</span>
          {mode !== 'connect' && (
            <span className="panel-actions">
              {clockHere && clock
                ? (
                  <span className="panel-clock">
                    <Elapsed start={clock.start}/>
                    <Tooltip title={t('stopClock')}>
                      <Button icon={stopIcon} aria-label={t('stopClock')} loader={stopping} disabled={stopping} onClick={stopClock}/>
                    </Tooltip>
                  </span>
                )
                : (
                  <Tooltip title={t('startClock')}>
                    <Button icon={playIcon} aria-label={t('startClock')} disabled={opening} onClick={openClock}/>
                  </Tooltip>
                )}
              <Tooltip title={t('logTime')}>
                <Button icon={addIcon} aria-label={t('logTime')} loader={opening} disabled={opening} onClick={openEntry}/>
              </Tooltip>
            </span>
          )}
        </div>
      )}

      {mode === 'add' && account && (
        <TimeDialog title={dialogTitle(editing, timing)} hidden={!modalReady || closing} onClose={closeEntry}>
          <EntryForm
            key={editing ? editing.id : String(timing)}
            timer={timing}
            notice={timing && clock && !clockHere ? t('clockRunningElsewhere', {text: clock.text}) : null}
            api={api}
            defaultText={issue.defaultText}
            projectKey={issue.projectKey}
            loadForm={editing ? loadPlainForm : loadForm}
            initialSchema={prefetched}
            editEntry={editing ? {...editing, billable: editing.billable ?? null, refs: editing.refs ?? {}} : null}
            submitLabel={submitLabel(editing, timing)}
            onSubmit={submit}
            onCancel={closeEntry}
          />
        </TimeDialog>
      )}

      {mode === 'connect' && (
        status
          ? (
            <AccountForm
              api={api}
              status={status}
              compact
              onChange={async next => {
                setStatus(next);
                setMode('view');
                await load();
              }}
            />
          )
          : <LoaderInline/>
      )}

      <div className="panel-fields">
        <span className="ett-label">{t('total')}</span>
        <span className="ett-duration">{summary.totalSeconds > 0 ? formatDuration(summary.totalSeconds) : '—'}</span>
        {!!summary.estimateSeconds && (
          <>
            <span className="ett-label">{t('estimate')}</span>
            <span className="ett-duration">{formatDuration(summary.estimateSeconds)}</span>
          </>
        )}
      </div>

      {!!summary.estimateSeconds && (
        <EstimateBar used={summary.totalSeconds} estimate={summary.estimateSeconds}/>
      )}

      {entries.length > 0 && (
        <ul className="panel-entries">
          {entries.map(entry => (
            <li
              key={`${entry.provider}-${entry.id}`}
              className={`panel-entry ${entry.deleted ? 'panel-entry--deleted' : ''}`}
              title={entry.text}
            >
              <span className="ett-duration panel-entry-duration">{formatDuration(entry.durationSeconds)}</span>
              <span className="ett-ellipsis">{entry.mine ? t('me') : entry.userName}</span>
              <span className="ett-muted ett-small panel-entry-date">{formatShortDate(new Date(entry.start))}</span>
              <span className="panel-entry-edit">
                {entry.mine && !entry.deleted && canEdit(entry.start, account) && (
                  <Button
                    inline
                    icon={pencilIcon}
                    aria-label={t('editEntry')}
                    title={t('editEntry')}
                    disabled={opening}
                    onClick={() => openEdit(entry)}
                  />
                )}
              </span>
              {entry.deleted && (
                <span className="panel-entry-note">
                  {t('deletedIn', {provider: account?.providerName ?? entry.provider})}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {summary.entries.length > VISIBLE_ENTRIES && (
        <Button inline onClick={() => setExpanded(!expanded)}>
          {expanded ? t('showLess') : t('showAll', {count: summary.entries.length})}
        </Button>
      )}

      {!account && mode === 'view' && (
        <div className="panel-connect">
          <span className="ett-muted ett-small">{t('connectHint')}</span>
          <Button inline onClick={startConnect}>{t('connectAccount')}</Button>
        </div>
      )}
    </div>
  );
};

export const App = memo(AppComponent);
