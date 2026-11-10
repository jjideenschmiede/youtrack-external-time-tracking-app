const assistant = require('./assistant');
const i18n = require('./i18n');
const jobs = require('./jobs');

const MAX_SECONDS = 24 * 3600;

function entryText(issue, text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) {
    return issue.summary ? issue.id + ': ' + issue.summary : issue.id;
  }
  return value.indexOf(issue.id) === 0 ? value : issue.id + ': ' + value;
}

function readStart(value, seconds) {
  if (!value) {
    return new Date(Date.now() - seconds * 1000);
  }
  const start = new Date(String(value));
  if (isNaN(start.getTime())) {
    throw new Error('start must be a date and time in ISO 8601 format, e.g. 2026-11-06T09:00:00+01:00.');
  }
  return start;
}

exports.aiTool = {
  name: 'log_time',
  description: 'Logs time on a YouTrack issue in the connected time tracking system (e.g. Clockodo) and adds the entry to the issue. ' +
    'Customer, project and service default to the last selection of the user in the issue project; pass names to choose others. ' +
    'Only log time the user explicitly asked for. The request runs in the background: call ' + assistant.JOB_RESULT_TOOL +
    ' with the returned jobId to confirm it.',
  inputSchema: {
    type: 'object',
    properties: {
      issue: {type: 'string', description: 'The readable issue ID, e.g. DEMO-123.'},
      duration: {type: 'string', description: 'The duration, e.g. "1h 30m", "1.5h", "90m" or "1:30".'},
      start: {type: 'string', description: 'Optional start in ISO 8601 with time zone offset. Defaults to now minus the duration, so the entry ends now.'},
      description: {type: 'string', description: 'Optional description. The issue ID is added in front automatically. Defaults to the issue summary.'},
      customer: {type: 'string', description: 'Optional exact customer name in the time tracking system.'},
      project: {type: 'string', description: 'Optional exact project name in the time tracking system.'},
      service: {type: 'string', description: 'Optional exact service name in the time tracking system.'},
      billable: {type: 'boolean', description: 'Optional. Defaults to the last selection of the user.'}
    },
    required: ['issue', 'duration']
  },
  annotations: {
    title: 'Log time',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  execute: (ctx) => assistant.run(ctx, () => {
    const args = ctx.arguments || {};
    const issue = assistant.requireIssue(ctx, args.issue, 'CREATE_WORK_ITEM');
    const seconds = assistant.parseDuration(args.duration);
    if (!seconds || seconds > MAX_SECONDS) {
      i18n.fail('durationInvalid', {value: String(args.duration || '')});
    }
    const start = readStart(args.start, seconds);
    return assistant.startJob(ctx, 'assisted', {
      issueId: issue.id,
      then: 'create',
      names: {customer: args.customer, project: args.project, service: args.service},
      body: {
        start: start.toISOString(),
        end: new Date(start.getTime() + seconds * 1000).toISOString(),
        text: entryText(issue, args.description),
        billable: args.billable
      }
    });
  }),
  asyncFunctions: jobs.asyncFunctions
};

exports.entryText = entryText;
