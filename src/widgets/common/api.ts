import type {HostAPI} from '../../../@types/globals';
import {lang, t} from './i18n';
import type {AccountStatus, Calendar, EntryForm, EntryInput, IssueSummary, Option, ProjectReport, TimeEntry} from './types';

type Result<T> = T & {error?: string};

export class ApiError extends Error {}

async function call<T>(
  host: HostAPI,
  path: string,
  params: {method?: string; query?: Record<string, string>; body?: unknown; scope?: boolean} = {}
): Promise<T> {
  let response: Result<T>;
  try {
    response = await host.fetchApp<Result<T>>(path, {scope: false, ...params, query: {...params.query, lang}});
  } catch (e) {
    throw new ApiError(e instanceof Error && e.message ? e.message : t('requestFailed'));
  }
  if (response && response.error) {
    throw new ApiError(response.error);
  }
  return response;
}

export function createApi(host: HostAPI) {
  return {
    getAccount: () => call<AccountStatus>(host, 'account/status'),
    connect: (provider: string, credentials: Record<string, string>) =>
      call<AccountStatus>(host, 'account/connect', {method: 'POST', body: {provider, credentials}}),
    disconnect: () => call<AccountStatus>(host, 'account/disconnect', {method: 'POST', body: {}}),

    getEntryForm: () => call<EntryForm>(host, 'timesheet/form'),
    getIssueEntryForm: () => call<EntryForm>(host, 'issue/form', {scope: true}),
    getOptions: (field: string, refs: Record<string, string | null>) => {
      const query: Record<string, string> = {field};
      Object.keys(refs).forEach(key => {
        const value = refs[key];
        if (value) {
          query[key] = value;
        }
      });
      return call<{options: Option[]}>(host, 'timesheet/options', {query});
    },
    getEntries: (from: Date, to: Date) =>
      call<{entries: TimeEntry[]}>(host, 'timesheet/entries', {query: {from: from.toISOString(), to: to.toISOString()}}),
    getCalendar: (fromDate: string, toDate: string) =>
      call<Calendar>(host, 'timesheet/calendar', {query: {fromDate, toDate}}),
    createEntry: (input: EntryInput) =>
      call<{entry: TimeEntry}>(host, 'timesheet/entries', {method: 'POST', body: input}),

    getIssueSummary: () => call<IssueSummary>(host, 'issue/summary', {method: 'POST', body: {}, scope: true}),
    createIssueEntry: (input: EntryInput) =>
      call<IssueSummary>(host, 'issue/entries', {method: 'POST', body: input, scope: true}),

    getProjectReport: (from: Date, to: Date) =>
      call<ProjectReport>(host, 'project/report', {method: 'POST', body: {from: from.toISOString(), to: to.toISOString()}, scope: true})
  };
}

export type Api = ReturnType<typeof createApi>;
