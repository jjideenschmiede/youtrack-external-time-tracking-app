import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Tooltip from '@jetbrains/ring-ui-built/components/tooltip/tooltip';
import addIcon from '@jetbrains/icons/add';
import closeIcon from '@jetbrains/icons/close';
import pencilIcon from '@jetbrains/icons/pencil';
import {createApi} from '../common/api';
import {AccountForm} from '../common/account-form';
import {EntryForm} from '../common/entry-form';
import {formatDuration, formatShortDate} from '../common/duration';
import {loadIssueContext, type IssueContext} from '../common/issue-context';
import {canEdit} from '../common/editable';
import type {AccountStatus, EntryForm as EntryFormSchema, EntryInput, IssueEntry, IssueSummary} from '../common/types';
import {t} from '../common/i18n';

const host = await YTApp.register();

const VISIBLE_ENTRIES = 3;
const REFRESH_INTERVAL = 10 * 60 * 1000;
const REFRESH_WINDOW = 60 * 24 * 3600 * 1000;

function claimRefresh(issueId: string): boolean {
  const key = `ett-refresh-${issueId}`;
  try {
    const last = Number(window.localStorage.getItem(key) || 0);
    if (Date.now() - last < REFRESH_INTERVAL) {
      return false;
    }
    window.localStorage.setItem(key, String(Date.now()));
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
      if (needsRefresh(nextSummary) && claimRefresh(nextIssue.id)) {
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

  useEffect(() => {
    if (mode !== 'add') {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeEntry();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, closeEntry]);

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
  }, [api, closeEntry, editing]);

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
  const entries = expanded ? summary.entries : summary.entries.slice(0, VISIBLE_ENTRIES);

  return (
    <div className={`panel ${mode === 'add' ? 'panel--modal' : ''}`}>
      {account && (
        <div className="panel-header">
          <span className="panel-title">{account.providerName}</span>
          {mode !== 'connect' && (
            <Tooltip title={t('logTime')}>
              <Button icon={addIcon} aria-label={t('logTime')} loader={opening} disabled={opening} onClick={openEntry}/>
            </Tooltip>
          )}
        </div>
      )}

      {mode === 'add' && account && (
        <div className="panel-modal-backdrop">
          <div className={`panel-modal ${modalReady && !closing ? '' : 'panel-modal--pending'}`} role="dialog" aria-modal="true" aria-label={t('logTime')}>
            <Button
              className="panel-modal-close"
              iconClassName="panel-modal-close-icon"
              icon={closeIcon}
              aria-label={t('cancel')}
              onClick={closeEntry}
            />
            <h2 className="panel-modal-title">
              <img className="panel-modal-icon" src="widget-icon.svg" alt=""/>
              {editing ? t('editTime') : t('logTime')}
            </h2>
            <EntryForm
              key={editing ? editing.id : 'new'}
              api={api}
              defaultText={issue.defaultText}
              projectKey={issue.projectKey}
              loadForm={editing ? loadPlainForm : loadForm}
              initialSchema={prefetched}
              editEntry={editing ? {...editing, billable: editing.billable ?? null, refs: editing.refs ?? {}} : null}
              submitLabel={editing ? t('save') : undefined}
              onSubmit={submit}
              onCancel={closeEntry}
            />
          </div>
        </div>
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
      </div>

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
