import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import {createApi} from '../common/api';
import {AccountForm} from '../common/account-form';
import {EntryForm} from '../common/entry-form';
import {formatDuration} from '../common/duration';
import {loadIssueContext, type IssueContext} from '../common/issue-context';
import type {AccountStatus, EntryInput} from '../common/types';
import {t} from '../common/i18n';

const host = await YTApp.register();

const AppComponent: React.FunctionComponent = () => {
  const api = useMemo(() => createApi(host), []);
  const loadForm = useCallback(() => api.getIssueEntryForm(), [api]);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [issue, setIssue] = useState<IssueContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAccount(), loadIssueContext(host)])
      .then(([account, context]) => {
        setStatus(account);
        setIssue(context);
      })
      .catch(e => setError(e instanceof Error ? e.message : t('dataLoadFailed')));
  }, [api]);

  const submit = useCallback(async (input: EntryInput) => {
    const result = await api.createIssueEntry(input);
    const duration = formatDuration((new Date(input.end).getTime() - new Date(input.start).getTime()) / 1000);
    host.alert(t('loggedTotal', {duration, total: formatDuration(result.totalSeconds)}));
    host.closeWidget();
  }, [api]);

  if (error) {
    return <div className="dialog"><Banner mode="error" withIcon inline>{error}</Banner></div>;
  }

  if (!status || !issue) {
    return <div className="dialog ett-centered"><LoaderInline/></div>;
  }

  return (
    <div className="dialog">
      {status.account ? (
        <EntryForm
          api={api}
          defaultText={issue.defaultText}
          projectKey={issue.projectKey}
          loadForm={loadForm}
          onSubmit={submit}
          onCancel={() => host.closeWidget()}
        />
      ) : (
        <AccountForm api={api} status={status} onChange={setStatus}/>
      )}
    </div>
  );
};

export const App = memo(AppComponent);
