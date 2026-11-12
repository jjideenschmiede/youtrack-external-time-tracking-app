const assistant = require('./assistant');
const common = require('./common');

const ENTRY_LIMIT = 100;

exports.aiTool = {
  name: 'issue_time',
  description: 'Returns the time logged via the External Time Tracking app on a YouTrack issue: the total, the estimation ' +
    '(if an estimation field is configured), the single entries and whether your clock is running on it.',
  inputSchema: {
    type: 'object',
    properties: {
      issue: {type: 'string', description: 'The readable issue ID, e.g. DEMO-123.'}
    },
    required: ['issue']
  },
  annotations: {
    title: 'Issue time',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  },
  execute: (ctx) => assistant.run(ctx, () => {
    const args = ctx.arguments || {};
    const issue = assistant.requireIssue(ctx, args.issue, 'CREATE_WORK_ITEM');
    const summary = common.issueSummary(ctx.currentUser, assistant.language(ctx), common.readIssueEntries(issue),
      common.issueEstimate(issue, ctx.currentUser, ctx.settings));
    const entries = summary.entries.filter((entry) => !entry.deleted);
    const result = {
      issue: issue.id,
      summary: issue.summary,
      total: assistant.duration(summary.totalSeconds),
      estimation: summary.estimateSeconds ? assistant.duration(summary.estimateSeconds) : null,
      entries: entries.slice(0, ENTRY_LIMIT).map((entry) => ({
        date: entry.start,
        user: entry.mine ? 'me' : entry.userName,
        description: entry.text,
        time: assistant.duration(entry.durationSeconds)
      })),
      clockRunning: !!summary.clock && summary.clock.issueId === issue.id
    };
    if (summary.estimateSeconds) {
      result.estimationUsedPercent = Math.round((summary.totalSeconds / summary.estimateSeconds) * 100);
    }
    return result;
  })
};
