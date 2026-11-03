import type {HostAPI} from '../../../@types/globals';

export interface IssueContext {
  id: string;
  summary: string;
  projectKey: string | null;
  defaultText: string;
}

interface IssueResponse {
  idReadable: string;
  summary: string | null;
  project?: {shortName?: string} | null;
}

export async function loadIssueContext(host: HostAPI): Promise<IssueContext> {
  const entityId = YTApp.entity?.id;
  if (!entityId) {
    throw new Error('Kein Ticket-Kontext vorhanden.');
  }
  const issue = await host.fetchYouTrack<IssueResponse>(`issues/${entityId}`, {
    query: {fields: 'idReadable,summary,project(shortName)'}
  });
  const summary = issue.summary ?? '';
  return {
    id: issue.idReadable,
    summary,
    projectKey: issue.project?.shortName ?? null,
    defaultText: summary ? `${issue.idReadable}: ${summary}` : issue.idReadable
  };
}
