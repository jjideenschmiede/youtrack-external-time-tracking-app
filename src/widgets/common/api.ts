import type {HostAPI} from '../../../@types/globals';
import {lang, t} from './i18n';
import type {AbsenceBalance, AbsenceInput, Account, AccountStatus, Calendar, EntryForm, EntryInput, IssueSummary, OAuthAuthorization, OAuthGrant, Option, ProjectReport, RunningClock, TimeEntry} from './types';

type Result<T> = T & {error?: string};
type Params = {method?: string; query?: Record<string, string>; body?: unknown; scope?: boolean};

interface JobTicket {
  job: string;
}

interface JobState<T> {
  status: 'pending' | 'done' | 'lost';
  result?: T;
}

const POLL_DELAYS = [250, 400, 600, 800, 1000];
const POLL_TIMEOUT = 45000;
const LOST_RETRIES = 2;

export class ApiError extends Error {}

class JobLostError extends Error {}

let jobQueue: Promise<unknown> = Promise.resolve();

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function request<T>(host: HostAPI, path: string, params: Params = {}): Promise<T> {
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

function isTicket(value: unknown): value is JobTicket {
  return !!value && typeof value === 'object' && typeof (value as JobTicket).job === 'string';
}

async function poll<T>(host: HostAPI, id: string): Promise<T> {
  const started = Date.now();
  for (let attempt = 0; Date.now() - started < POLL_TIMEOUT; attempt++) {
    await wait(POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]);
    const state = await request<JobState<T>>(host, 'account/job', {query: {id}});
    if (state.status === 'done') {
      return state.result as T;
    }
    if (state.status === 'lost') {
      throw new JobLostError();
    }
  }
  throw new ApiError(t('requestTimeout'));
}

async function runJob<T>(host: HostAPI, path: string, params: Params, retries: number): Promise<T> {
  const response = await request<T | JobTicket>(host, path, {method: 'POST', body: {}, ...params});
  if (!isTicket(response)) {
    return response as T;
  }
  try {
    return await poll<T>(host, response.job);
  } catch (e) {
    if (!(e instanceof JobLostError)) {
      throw e;
    }
    if (retries <= 0) {
      throw new ApiError(t('requestExpired'));
    }
    return runJob<T>(host, path, params, retries - 1);
  }
}

function job<T>(host: HostAPI, path: string, params: Params, repeatable = false): Promise<T> {
  const run = () => runJob<T>(host, path, params, repeatable ? LOST_RETRIES : 0);
  const result = jobQueue.then(run, run);
  jobQueue = result.catch(() => undefined);
  return result;
}

export function createApi(host: HostAPI) {
  return {
    getAccount: () => request<AccountStatus>(host, 'account/status'),
    connect: (provider: string, credentials: Record<string, string>) =>
      job<AccountStatus>(host, 'account/connect', {body: {provider, credentials}}),
    startOAuth: (provider: string, redirectUri: string) =>
      job<OAuthAuthorization>(host, 'account/oauth/start', {body: {provider, redirectUri}}),
    connectOAuth: (provider: string, oauth: OAuthGrant) =>
      job<AccountStatus>(host, 'account/connect', {body: {provider, oauth}}),
    disconnect: () => request<AccountStatus>(host, 'account/disconnect', {method: 'POST', body: {}}),

    getEntryForm: () => request<EntryForm>(host, 'timesheet/form'),
    getIssueEntryForm: () => job<EntryForm>(host, 'issue/form', {scope: true}, true),
    getOptions: (field: string, refs: Record<string, string | null>) => {
      const selected: Record<string, string> = {};
      Object.keys(refs).forEach(key => {
        const value = refs[key];
        if (value) {
          selected[key] = value;
        }
      });
      return job<{options: Option[]}>(host, 'timesheet/options', {body: {field, refs: selected}}, true);
    },
    getEntries: (from: Date, to: Date) =>
      job<{entries: TimeEntry[]; account?: Account | null}>(host, 'timesheet/list', {body: {from: from.toISOString(), to: to.toISOString()}}, true),
    getCalendar: (fromDate: string, toDate: string) =>
      job<Calendar>(host, 'timesheet/calendar', {body: {fromDate, toDate}}, true),
    createAbsence: (input: AbsenceInput) =>
      job<{requested: boolean}>(host, 'timesheet/absences', {body: input}),
    getAbsenceBalance: (year: number) =>
      job<AbsenceBalance>(host, 'timesheet/absences/balance', {body: {year}}, true),
    cancelAbsence: (id: string, requested: boolean) =>
      job<{cancelled: boolean}>(host, 'timesheet/absences/cancel', {body: {id, requested}}),
    createEntry: (input: EntryInput) =>
      job<{entry: TimeEntry}>(host, 'timesheet/entries', {body: input}),
    updateEntry: (id: string, input: EntryInput, previousText: string) =>
      job<{entry: TimeEntry}>(host, 'timesheet/update', {body: {id, entry: input, previousText}}),

    syncClock: () => job<{clock: RunningClock | null}>(host, 'timesheet/clock', {}, true),
    stopClock: (id: string) => job<{clock: RunningClock | null}>(host, 'timesheet/clock/stop', {body: {id}}),
    startIssueClock: (input: EntryInput) => job<IssueSummary>(host, 'issue/clock/start', {body: input, scope: true}),
    stopIssueClock: () => job<IssueSummary>(host, 'issue/clock/stop', {scope: true}),

    getIssueSummary: () => request<IssueSummary>(host, 'issue/summary', {scope: true}),
    setEstimationField: (name: string | null) =>
      request<IssueSummary>(host, 'issue/estimation-field', {method: 'POST', body: {name}, scope: true}),
    refreshIssue: () => job<{changed: boolean}>(host, 'issue/refresh', {scope: true}, true),
    createIssueEntry: (input: EntryInput) =>
      job<IssueSummary>(host, 'issue/entries', {body: input, scope: true}),
    updateIssueEntry: (id: string, input: EntryInput) =>
      job<IssueSummary>(host, 'issue/update', {body: {id, entry: input}, scope: true}),

    getProjectReport: (from: Date, to: Date) =>
      request<ProjectReport>(host, 'project/report', {method: 'POST', body: {from: from.toISOString(), to: to.toISOString()}, scope: true}),
    backfillProject: (from: Date, to: Date) =>
      job<{changed: boolean}>(host, 'project/backfill', {body: {from: from.toISOString(), to: to.toISOString()}, scope: true}, true)
  };
}

export type Api = ReturnType<typeof createApi>;
