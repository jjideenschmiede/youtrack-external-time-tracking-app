const assistant = require('./assistant');
const report = require('./report');

const GROUPS = ['issue', 'user', 'customer', 'project', 'service'];
const ENTRY_LIMIT = 200;

function groupKey(entry, groupBy) {
  if (groupBy === 'issue') {
    return {key: entry.issue.id, name: entry.issue.id + ' ' + entry.issue.summary};
  }
  if (groupBy === 'user') {
    return {key: entry.userLogin, name: entry.userName || entry.userLogin};
  }
  const ref = entry.refs[groupBy];
  return ref ? {key: ref.id, name: ref.name} : {key: '', name: 'None'};
}

function summarize(entries, groupBy) {
  const groups = {};
  entries.forEach((entry) => {
    const identity = groupKey(entry, groupBy);
    const group = groups[identity.key] || {name: identity.name, seconds: 0, entries: 0};
    group.seconds += entry.durationSeconds;
    group.entries += 1;
    groups[identity.key] = group;
  });
  return Object.keys(groups)
    .map((key) => groups[key])
    .sort((a, b) => b.seconds - a.seconds)
    .map((group) => ({name: group.name, entries: group.entries, time: assistant.duration(group.seconds)}));
}

exports.aiTool = {
  name: 'project_report',
  description: 'Returns the time logged via the External Time Tracking app for the issues of a YouTrack project in a date range, ' +
    'grouped by issue, user, customer, project or service of the time tracking system (e.g. Clockodo). ' +
    'Requires the permission to update work items of other users in the project.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {type: 'string', description: 'The short name (ID) of the YouTrack project, e.g. DEMO.'},
      from: {type: 'string', description: 'First day of the range in the format YYYY-MM-DD.'},
      to: {type: 'string', description: 'Last day of the range (inclusive) in the format YYYY-MM-DD. At most 366 days after from.'},
      groupBy: {type: 'string', enum: GROUPS, description: 'How to group the time. Defaults to issue.'},
      includeEntries: {type: 'boolean', description: 'Also return the single time entries (at most 200). Defaults to false.'}
    },
    required: ['project', 'from', 'to']
  },
  annotations: {
    title: 'Project time report',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  },
  execute: (ctx) => assistant.run(ctx, () => {
    const args = ctx.arguments || {};
    const project = assistant.requireProject(ctx, args.project, 'UPDATE_NOT_OWN_WORK_ITEM');
    const range = report.readRange(assistant.readPeriod(args));
    const groupBy = GROUPS.indexOf(args.groupBy) === -1 ? 'issue' : args.groupBy;
    const data = report.collect(project, ctx.currentUser, range, ctx.settings);
    const total = data.entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
    const result = {
      project: project.key,
      from: args.from,
      to: args.to,
      total: assistant.duration(total),
      entries: data.entries.length,
      groupBy: groupBy,
      groups: summarize(data.entries, groupBy)
    };
    if (args.includeEntries) {
      result.items = data.entries.slice(0, ENTRY_LIMIT).map((entry) => ({
        date: entry.start,
        issue: entry.issue.id,
        user: entry.userName || entry.userLogin,
        customer: entry.refs.customer ? entry.refs.customer.name : null,
        project: entry.refs.project ? entry.refs.project.name : null,
        service: entry.refs.service ? entry.refs.service.name : null,
        description: entry.text,
        time: assistant.duration(entry.durationSeconds)
      }));
    }
    if (data.needsRefs) {
      result.note = 'Some older entries have no customer, project or service yet. Open the Time Tracking tab of the project once to complete them.';
    }
    return result;
  })
};
