import type {HostAPI} from '../../../@types/globals';

export interface IssueContext {
  id: string;
  summary: string;
  projectKey: string | null;
  estimationField: string | null;
  defaultText: string;
}

interface IssueResponse {
  idReadable: string;
  summary: string | null;
  project?: {
    shortName?: string;
    plugins?: {timeTrackingSettings?: {enabled?: boolean; estimate?: {field?: {name?: string} | null} | null} | null} | null;
  } | null;
}

export async function loadIssueContext(host: HostAPI): Promise<IssueContext> {
  const entityId = YTApp.entity?.id;
  if (!entityId) {
    throw new Error('Kein Ticket-Kontext vorhanden.');
  }
  const issue = await host.fetchYouTrack<IssueResponse>(`issues/${entityId}`, {
    query: {fields: 'idReadable,summary,project(shortName,plugins(timeTrackingSettings(enabled,estimate(field(name)))))'}
  });
  const summary = issue.summary ?? '';
  const timeTracking = issue.project?.plugins?.timeTrackingSettings;
  return {
    id: issue.idReadable,
    summary,
    projectKey: issue.project?.shortName ?? null,
    estimationField: timeTracking?.enabled ? timeTracking.estimate?.field?.name ?? null : null,
    defaultText: summary ? `${issue.idReadable}: ${summary}` : issue.idReadable
  };
}
