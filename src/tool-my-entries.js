const assistant = require('./assistant');
const jobs = require('./jobs');

exports.aiTool = {
  name: 'my_entries',
  description: 'Loads your own time entries from the connected time tracking system (e.g. clocko:do) for a date range of at most 62 days. ' +
    'The request runs in the background: the tool returns a jobId, then call ' + assistant.JOB_RESULT_TOOL + ' to get the entries.',
  inputSchema: {
    type: 'object',
    properties: {
      from: {type: 'string', description: 'First day of the range in the format YYYY-MM-DD.'},
      to: {type: 'string', description: 'Last day of the range (inclusive) in the format YYYY-MM-DD.'}
    },
    required: ['from', 'to']
  },
  annotations: {
    title: 'My time entries',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  execute: (ctx) => assistant.run(ctx, () => assistant.startJob(ctx, 'entries', assistant.readPeriod(ctx.arguments || {}))),
  asyncFunctions: jobs.asyncFunctions
};
