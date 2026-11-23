export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'secret';
  placeholder?: string;
  help?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  credentialFields: CredentialField[];
  credentialHelp?: string | null;
  credentialHelpUrl?: string | null;
}

export interface Account {
  provider: string;
  providerName: string;
  name: string;
  email: string;
  company: string | null;
  lock?: EditLock | null;
  links: ProviderLink[];
  absenceTypes?: AbsenceType[];
}

export interface AbsenceType {
  id: string;
  kind: AbsenceDay['kind'];
  label: string;
}

export interface AbsenceBalance {
  year: number;
  balance: {total: number; remaining: number} | null;
}

export interface AbsenceInput {
  type: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  note: string;
}

export interface EditLock {
  known: boolean;
  unrestricted: boolean;
  date: string | null;
  days: number | null;
}

export interface EditableEntry {
  id: string;
  start: string;
  durationSeconds: number;
  text: string;
  billable: boolean | null;
  refs: Record<string, NamedRef | null>;
}

export interface ProviderLink {
  label: string;
  url: string;
}

export interface AccountStatus {
  providers: ProviderInfo[];
  account: Account | null;
}

export interface EntryField {
  key: string;
  label: string;
  required: boolean;
  dependsOn: string | null;
}

export interface Option {
  id: string;
  label: string;
}

export interface EntryForm {
  providerName: string;
  fields: EntryField[];
  supportsBillable: boolean;
  defaults: {
    refs: Record<string, Option | null>;
    billable: boolean;
  };
  mappedFields?: Record<string, string>;
  warnings?: string[];
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface IssueRef {
  id: string;
  summary: string;
  url: string;
  estimateSeconds?: number | null;
}

export interface TimeEntry {
  id: string;
  start: string;
  end: string | null;
  durationSeconds: number;
  text: string;
  billable: boolean | null;
  refs: Record<string, NamedRef | null>;
  issues: IssueRef[];
}

export interface IssueEntry {
  id: string;
  provider: string;
  start: string;
  durationSeconds: number;
  text: string;
  userLogin: string;
  userName: string;
  mine: boolean;
  deleted: boolean;
  billable?: boolean | null;
  refs?: Record<string, NamedRef | null>;
}

export interface RunningClock {
  id: string;
  start: string;
  text: string;
  issueId: string | null;
  issue?: IssueRef | null;
  refs?: Record<string, NamedRef | null>;
}

export interface IssueSummary {
  account: Account | null;
  totalSeconds: number;
  estimateSeconds?: number | null;
  estimationField?: string | null;
  clock?: RunningClock | null;
  entries: IssueEntry[];
}

export interface EntryInput {
  start: string;
  end: string;
  text: string;
  billable: boolean;
  refs: Record<string, string | null>;
  labels: Record<string, string>;
  projectKey?: string | null;
}

export interface AbsenceDay {
  id: string;
  date: string;
  from: string;
  to: string;
  kind: 'vacation' | 'sick' | 'remote' | 'other';
  label: string;
  requested: boolean;
  halfDay: boolean;
  hours: number | null;
}

export interface HolidayDay {
  date: string;
  name: string;
  halfDay: boolean;
}

export interface Calendar {
  absences: AbsenceDay[];
  holidays: HolidayDay[];
}

export interface ProjectReportEntry {
  id: string;
  start: string;
  durationSeconds: number;
  text: string;
  userLogin: string;
  userName: string;
  mine: boolean;
  refs: Record<string, NamedRef | null>;
  issue: IssueRef;
}

export interface ProjectReport {
  entries: ProjectReportEntry[];
  needsRefs?: boolean;
}
