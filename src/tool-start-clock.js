const assistant = require('./assistant');
const jobs = require('./jobs');
const logTime = require('./tool-log-time');

exports.aiTool = {
  name: 'start_clock',
  description: 'Starts the clock (stopwatch) of the connected time tracking system (e.g. clocko:do) for a YouTrack issue. ' +
    'A clock that is already running is stopped. Customer, project and service default to the last selection of the user in the ' +
    'issue project. The request runs in the background: call ' + assistant.JOB_RESULT_TOOL + ' with the returned jobId to confirm it.',
  inputSchema: {
    type: 'object',
    properties: {
      issue: {type: 'string', description: 'The readable issue ID, e.g. DEMO-123.'},
      description: {type: 'string', description: 'Optional description. The issue ID is added in front automatically.'},
      customer: {type: 'string', description: 'Optional exact customer name in the time tracking system.'},
      project: {type: 'string', description: 'Optional exact project name in the time tracking system.'},
      service: {type: 'string', description: 'Optional exact service name in the time tracking system.'},
      billable: {type: 'boolean', description: 'Optional. Defaults to the last selection of the user.'}
    },
    required: ['issue']
  },
  annotations: {
    title: 'Start clock',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  execute: (ctx) => assistant.run(ctx, () => {
    const args = ctx.arguments || {};
    const issue = assistant.requireIssue(ctx, args.issue, 'CREATE_WORK_ITEM');
    return assistant.startJob(ctx, 'assisted', {
      issueId: issue.id,
      then: 'clockStart',
      names: {customer: args.customer, project: args.project, service: args.service},
      body: {text: logTime.entryText(issue, args.description), billable: args.billable}
    });
  }),
  asyncFunctions: jobs.asyncFunctions
};
