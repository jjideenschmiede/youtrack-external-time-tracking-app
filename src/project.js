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

function hasRefs(entry) {
  return !!entry.refs && ['customer', 'project', 'service'].some((key) => !!entry.refs[key]);
}

function remoteEntries(ctx, range, provider) {
  if (!common.readAccount(ctx.currentUser)) {
    return null;
  }
  try {
    const session = common.openSession(ctx.currentUser, i18n.language(ctx));
    if (session.provider.id !== provider) {
      return null;
    }
    const byId = {};
    session.provider.listEntries(session, {
      from: new Date(range.from - DAY).toISOString(),
      to: new Date(range.to + DAY).toISOString()
    }, true, true).forEach((entry) => {
      byId[entry.id] = entry;
    });
    return byId;
  } catch (e) {
    console.warn('external-time-tracking: report refs unavailable: ' + (e.message || e));
    return null;
  }
}

function needsRefs(entry, range) {
  const start = new Date(entry.start).getTime();
  return !entry.deleted && !entry.refsChecked && !hasRefs(entry) && start >= range.from && start < range.to;
}

function backfillRefs(ctx, range, issues) {
  let provider = null;
  let from = Infinity;
  let to = -Infinity;
  issues.forEach((issue) => {
    common.readIssueEntries(issue).forEach((entry) => {
      if (needsRefs(entry, range)) {
        const start = new Date(entry.start).getTime();
        provider = provider || entry.provider;
        from = Math.min(from, start);
        to = Math.max(to, start);
      }
    });
  });
  if (!provider) {
    return;
  }
  const remote = remoteEntries(ctx, {from: from, to: to + DAY}, provider);
  if (!remote) {
    return;
  }
  issues.forEach((issue) => {
    let changed = false;
    const entries = common.readIssueEntries(issue).map((entry) => {
      if (entry.provider !== provider || !needsRefs(entry, range)) {
        return entry;
      }
      changed = true;
      const current = remote[entry.id];
      return current && hasRefs(current)
        ? Object.assign({}, entry, {refs: current.refs})
        : Object.assign({}, entry, {refsChecked: true});
    });
    if (changed) {
      issue.extensionProperties.timeTrackingEntries = JSON.stringify(entries);
    }
  });
}

function stripIssueId(text, issueId) {
  return (text || '').replace(new RegExp('^' + issueId + '[:\\s-]*'), '').trim();
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

  const kept = [];
  const visible = [];
  index.issues.forEach((id) => {
    const issue = findIssue(id);
    if (!issue || issue.project.key !== ctx.project.key || kept.indexOf(issue.id) !== -1) {
      return;
    }
    kept.push(issue.id);
    if (issue.isVisibleTo(ctx.currentUser)) {
      visible.push(issue);
    }
  });

  backfillRefs(ctx, range, visible);

  const entries = [];
  visible.forEach((issue) => {
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
        text: stripIssueId(entry.text, issue.id),
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
      permissions: ['UPDATE_NOT_OWN_WORK_ITEM'],
      handle: (ctx) => {
        common.respond(ctx, () => projectReport(ctx));
      }
    }
  ]
};
