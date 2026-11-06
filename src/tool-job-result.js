const assistant = require('./assistant');
const jobs = require('./jobs');

function describe(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }
  const output = Object.assign({}, result);
  delete output.account;
  if (output.estimateSeconds) {
    output.estimation = assistant.duration(output.estimateSeconds);
  }
  delete output.estimateSeconds;
  if (Array.isArray(output.entries)) {
    output.entries = output.entries.map((entry) => ({
      id: entry.id,
      start: entry.start,
      end: entry.end || null,
      description: entry.text,
      billable: entry.billable,
      customer: entry.refs && entry.refs.customer ? entry.refs.customer.name : null,
      project: entry.refs && entry.refs.project ? entry.refs.project.name : null,
      service: entry.refs && entry.refs.service ? entry.refs.service.name : null,
      issues: (entry.issues || []).map((issue) => issue.id),
      time: assistant.duration(entry.durationSeconds || 0)
    }));
    output.total = assistant.duration(result.entries.reduce((sum, entry) => sum + (entry.durationSeconds || 0), 0));
  }
  if (typeof output.totalSeconds === 'number') {
    output.total = assistant.duration(output.totalSeconds);
    delete output.totalSeconds;
  }
  return output;
}

exports.aiTool = {
  name: 'job_result',
  description: 'Returns the result of a background request that another External Time Tracking tool started. ' +
    'If the status is still pending, wait a few seconds and call this tool again.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {type: 'string', description: 'The jobId returned by the other tool.'}
    },
    required: ['jobId']
  },
  annotations: {
    title: 'Background request result',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  },
  execute: (ctx) => assistant.run(ctx, () => {
    const state = jobs.readJob(ctx.currentUser, String((ctx.arguments || {}).jobId || ''));
    return state.status === 'done' ? {status: 'done', result: describe(state.result)} : {status: 'pending'};
  })
};
