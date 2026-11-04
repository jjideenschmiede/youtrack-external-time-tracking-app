const entities = require('@jetbrains/youtrack-scripting-api/entities');
const common = require('./common');
const i18n = require('./i18n');

const MAX_RANGE_DAYS = 366;
const DAY = 24 * 3600 * 1000;

function readRange(body) {
  const from = new Date(body.from);
  const to = new Date(body.to);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
    i18n.fail('invalidRange');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) {
    i18n.fail('reportRangeTooLong');
  }
  return {from: from.getTime(), to: to.getTime()};
}

function scanProject(project) {
  const found = [];
  project.issues.forEach((issue) => {
    if (common.readIssueEntries(issue).length > 0) {
      found.push(issue.id);
    }
  });
  return found;
}

function loadIndex(project) {
  const index = common.readProjectIndex(project) || {complete: false, issues: []};
  if (!index.complete) {
    scanProject(project).forEach((id) => {
      if (index.issues.indexOf(id) === -1) {
        index.issues.push(id);
      }
    });
    index.complete = true;
    common.writeProjectIndex(project, index);
  }
  return index;
}

function findIssue(id) {
  try {
    return entities.Issue.findById(id);
  } catch {
    return null;
  }
}

function projectReport(ctx) {
  const range = readRange(common.requestBody(ctx));
  const index = loadIndex(ctx.project);

  const entries = [];
  const kept = [];
  index.issues.forEach((id) => {
    const issue = findIssue(id);
    if (!issue || issue.project.key !== ctx.project.key || kept.indexOf(issue.id) !== -1) {
      return;
    }
    kept.push(issue.id);
    if (!issue.isVisibleTo(ctx.currentUser)) {
      return;
    }
    const ref = {id: issue.id, summary: issue.summary, url: issue.url};
    common.readIssueEntries(issue).forEach((entry) => {
      const start = new Date(entry.start).getTime();
      if (entry.deleted || isNaN(start) || start < range.from || start >= range.to) {
        return;
      }
      entries.push({
        id: entry.id,
        start: entry.start,
        durationSeconds: entry.durationSeconds,
        text: entry.text,
        userLogin: entry.userLogin,
        userName: entry.userName,
        mine: entry.userLogin === ctx.currentUser.login,
        refs: entry.refs || {},
        issue: ref
      });
    });
  });

  if (kept.length !== index.issues.length || kept.some((id, i) => id !== index.issues[i])) {
    common.writeProjectIndex(ctx.project, {complete: true, issues: kept});
  }

  entries.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  return {entries: entries};
}

exports.httpHandler = {
  endpoints: [
    {
      scope: 'project',
      method: 'POST',
      path: 'report',
      handle: (ctx) => {
        common.respond(ctx, () => projectReport(ctx));
      }
    }
  ]
};
