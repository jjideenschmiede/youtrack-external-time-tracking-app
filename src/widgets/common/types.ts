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
  links: ProviderLink[];
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
  refs?: Record<string, NamedRef | null>;
}

export interface IssueSummary {
  account: Account | null;
  totalSeconds: number;
  mySeconds: number;
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
  date: string;
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
}
