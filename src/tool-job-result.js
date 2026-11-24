const assistant = require('./assistant');
const jobs = require('./jobs');
const i18n = require('./i18n');

const ENTRY_LIMIT = 500;

function describeEntry(entry) {
  const output = {
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
  };
  if (entry.userLogin) {
    output.user = entry.mine ? 'me' : entry.userName || entry.userLogin;
  }
  return output;
}

function describeClock(clock) {
  if (!clock) {
    return {running: false};
  }
  const seconds = Math.max(0, Math.round((Date.now() - new Date(clock.start).getTime()) / 1000));
  return {
    running: true,
    since: clock.start,
    description: clock.text,
    issue: clock.issueId || null,
    elapsed: assistant.duration(seconds)
  };
}

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
  if (Array.isArray(result.entries)) {
    const entries = result.entries.filter((entry) => !entry.deleted);
    output.entries = entries.slice(0, ENTRY_LIMIT).map(describeEntry);
    output.entryCount = entries.length;
    output.total = assistant.duration(entries.reduce((sum, entry) => sum + (entry.durationSeconds || 0), 0));
  }
  if ('clock' in output) {
    output.clock = describeClock(output.clock);
  }
  if ('stopped' in output) {
    output.stopped = output.stopped ? describeEntry(output.stopped) : null;
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
    const state = jobs.jobState(ctx.currentUser, String((ctx.arguments || {}).jobId || ''));
    if (state.status === 'lost') {
      i18n.fail('jobNotFound');
    }
    return state.status === 'done' ? {status: 'done', result: describe(state.result)} : {status: 'pending'};
  })
};
