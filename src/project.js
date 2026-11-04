const search = require('@jetbrains/youtrack-scripting-api/search');
const common = require('./common');
const i18n = require('./i18n');

const MAX_RANGE_DAYS = 366;
const DAY = 24 * 3600 * 1000;

function readRange(ctx) {
  const from = new Date(ctx.request.getParameter('from'));
  const to = new Date(ctx.request.getParameter('to'));
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
    i18n.fail('invalidRange');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) {
    i18n.fail('reportRangeTooLong');
  }
  return {from: from.getTime(), to: to.getTime()};
}

function projectReport(ctx) {
  const range = readRange(ctx);
  const issues = search.search(ctx.project, {
    query: '',
    extensionPropertiesQuery: {timeTrackingLogged: true}
  }, ctx.currentUser);

  const entries = [];
  issues.forEach((issue) => {
    if (issue.project.key !== ctx.project.key) {
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

  entries.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  return {entries: entries};
}

exports.httpHandler = {
  endpoints: [
    {
      scope: 'project',
      method: 'GET',
      path: 'report',
      handle: (ctx) => {
        common.respond(ctx, () => projectReport(ctx));
      }
    }
  ]
};
