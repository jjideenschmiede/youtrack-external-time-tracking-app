const entities = require('@jetbrains/youtrack-scripting-api/entities');
const i18n = require('./i18n');
const jobs = require('./jobs');

const DAY = 24 * 3600 * 1000;
const JOB_RESULT_TOOL = 'time_tracking_job_result';
const DURATION_UNITS = {h: 3600, m: 60};

function language(ctx) {
  return i18n.userLanguage(ctx.currentUser);
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return rest + 'm';
  }
  return rest === 0 ? hours + 'h' : hours + 'h ' + rest + 'm';
}

function duration(seconds) {
  return {seconds: seconds, hours: Math.round((seconds / 3600) * 100) / 100, text: formatDuration(seconds)};
}

function parseDuration(value) {
  if (typeof value === 'number' && value > 0) {
    return Math.round(value * 60);
  }
  const text = String(value || '').trim().toLowerCase().replace(',', '.');
  const clock = text.match(/^(\d+):(\d{2})$/);
  if (clock) {
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60;
  }
  const parts = text.match(/(\d+(?:\.\d+)?)\s*([hm])/g);
  if (parts && parts.join('').replace(/\s/g, '') === text.replace(/\s/g, '')) {
    return Math.round(parts.reduce((sum, part) => {
      const match = part.match(/(\d+(?:\.\d+)?)\s*([hm])/);
      return sum + Number(match[1]) * DURATION_UNITS[match[2]];
    }, 0));
  }
  if (/^\d+$/.test(text)) {
    return Number(text) * 60;
  }
  return null;
}

function readDate(value, name) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) {
    throw new Error(name + ' must be a date in the format YYYY-MM-DD.');
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function readPeriod(args) {
  const from = readDate(args.from, 'from');
  const to = readDate(args.to, 'to') + DAY;
  if (to <= from) {
    throw new Error('to must not be before from.');
  }
  return {from: new Date(from).toISOString(), to: new Date(to).toISOString()};
}

function findIssue(id) {
  try {
    return id ? entities.Issue.findById(String(id).trim()) : null;
  } catch {
    return null;
  }
}

function requireIssue(ctx, id, permission) {
  const user = ctx.currentUser;
  const issue = findIssue(id);
  if (!issue || !issue.isVisibleTo(user)) {
    i18n.fail('issueNotFound', {issue: id || ''});
  }
  if (!user.hasPermission(permission, issue.project)) {
    i18n.fail('permissionDenied');
  }
  return issue;
}

function requireProject(ctx, key, permission) {
  const user = ctx.currentUser;
  const project = entities.Project.findByKey(String(key || '').trim());
  if (!project || !user.hasPermission(permission, project)) {
    throw new Error('The project "' + (key || '') + '" was not found or you are not allowed to see its time report.');
  }
  return project;
}

function jobContext(ctx) {
  return {
    currentUser: ctx.currentUser,
    settings: ctx.settings,
    store: (key, value) => ctx.store(key, value),
    load: (key) => ctx.load(key)
  };
}

function pending(result, describe) {
  if (result && typeof result.job === 'string') {
    return {
      status: 'pending',
      jobId: result.job,
      instruction: 'The request was sent to the time tracking system. Call ' + JOB_RESULT_TOOL +
        ' with this jobId in a few seconds to get the result.'
    };
  }
  return {status: 'done', result: describe ? describe(result) : result};
}

function startJob(ctx, kind, params, describe) {
  return pending(jobs.start(jobContext(ctx), language(ctx), kind, params), describe);
}

function run(ctx, action) {
  try {
    return action();
  } catch (e) {
    throw new Error(i18n.errorMessage(language(ctx), e));
  }
}

exports.JOB_RESULT_TOOL = JOB_RESULT_TOOL;
exports.duration = duration;
exports.parseDuration = parseDuration;
exports.readPeriod = readPeriod;
exports.requireIssue = requireIssue;
exports.requireProject = requireProject;
exports.startJob = startJob;
exports.run = run;
exports.language = language;
