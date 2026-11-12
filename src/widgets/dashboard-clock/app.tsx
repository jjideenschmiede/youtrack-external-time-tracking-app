import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Link from '@jetbrains/ring-ui-built/components/link/link';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import stopIcon from '@jetbrains/icons/stop';
import {Elapsed} from '../common/elapsed';
import {createApi} from '../common/api';
import {formatTime} from '../common/duration';
import type {RunningClock} from '../common/types';
import {t} from '../common/i18n';

const REFRESH_MS = 60000;

let refresh: () => void = () => undefined;

const host = await YTApp.register({onRefresh: () => refresh()});

function meta(clock: RunningClock): string {
  const refs = clock.refs ?? {};
  return ['customer', 'project', 'service'].map(key => refs[key]?.name).filter(Boolean).join(' · ');
}

function description(clock: RunningClock): string {
  const text = clock.issue ? clock.text.replace(new RegExp(`^${clock.issue.id}[:\\s-]*`), '') : clock.text;
  return text.trim() || (clock.issue?.summary ?? '—');
}

const AppComponent: React.FunctionComponent = () => {
  const api = useMemo(() => createApi(host), []);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [clock, setClock] = useState<RunningClock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const load = useCallback(async () => {
    try {
      const status = await api.getAccount();
      const result = status.account ? await api.syncClock() : null;
      setClock(result ? result.clock : null);
      setConnected(!!status.account);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('statusLoadFailed'));
    }
  }, [api]);

  useEffect(() => {
    refresh = load;
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        load();
      }
    }, REFRESH_MS);
    return () => {
      refresh = () => undefined;
      window.clearInterval(timer);
    };
  }, [load]);

  const stopClock = useCallback(async (running: RunningClock) => {
    setStopping(true);
    try {
      await api.stopClock(running.id);
      host.alert(t('clockStopped'));
    } catch (e) {
      host.alert(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setStopping(false);
    }
    await load();
  }, [api, load]);

  if (error) {
    return (
      <div className="widget">
        <Banner mode="error" withIcon inline>
          {error}
          {' '}
          <Button inline onClick={load}>{t('retry')}</Button>
        </Banner>
      </div>
    );
  }

  if (connected === null) {
    return <div className="widget"><LoaderInline/></div>;
  }

  if (!clock) {
    return (
      <div className="widget">
        <div className="empty">
          <span className="empty-face" aria-hidden="true">{'(・_・)'}</span>
          <span>{connected ? t('noClock') : t('connectInProfile')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="widget">
      <div className="clock">
        <Elapsed start={clock.start} className="clock-time"/>
        <Tag readOnly tagType={Tag.Type.SUCCESS}>{t('clockSince', {time: formatTime(new Date(clock.start))})}</Tag>
        <div className="clock-main">
          <span className="clock-text">
            {clock.issue && (
              <Link href={clock.issue.url} target="_blank" rel="noopener noreferrer" className="clock-issue" title={clock.issue.summary}>
                {clock.issue.id}
              </Link>
            )}
            <span className="ett-ellipsis">{description(clock)}</span>
          </span>
          {meta(clock) && <span className="ett-muted ett-small ett-ellipsis">{meta(clock)}</span>}
        </div>
        <span className="clock-stop">
          <Button
            icon={stopIcon}
            aria-label={t('stopClock')}
            title={t('stopClock')}
            loader={stopping}
            disabled={stopping}
            onClick={() => stopClock(clock)}
          />
        </span>
      </div>
    </div>
  );
};

export const App = memo(AppComponent);
