const assistant = require('./assistant');
const jobs = require('./jobs');

const FIELDS = ['customer', 'project', 'service'];

exports.aiTool = {
  name: 'list_options',
  description: 'Lists the names of the customers, projects or services of the connected time tracking system (e.g. Clockodo). ' +
    'Use it to find the exact name before you pass customer, project or service to time_tracking_log_time or ' +
    'time_tracking_start_clock. Returns at most 200 names, narrow the list with search. The request runs in the background: ' +
    'if the tool returns a jobId, call ' + assistant.JOB_RESULT_TOOL + ' to get the names.',
  inputSchema: {
    type: 'object',
    properties: {
      field: {type: 'string', enum: FIELDS, description: 'Which names to list.'},
      customer: {type: 'string', description: 'The exact customer name. Required for the field project, as projects belong to a customer.'},
      search: {type: 'string', description: 'Optional text that the names must contain.'}
    },
    required: ['field']
  },
  annotations: {
    title: 'Customers, projects and services',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  execute: (ctx) => assistant.run(ctx, () => {
    const args = ctx.arguments || {};
    return assistant.startJob(ctx, 'optionNames', {field: args.field, names: {customer: args.customer}, search: args.search});
  }),
  asyncFunctions: jobs.asyncFunctions
};
