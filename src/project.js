const common = require('./common');
const jobs = require('./jobs');
const report = require('./report');

function stripIssueId(text, issueId) {
  return (text || '').replace(new RegExp('^' + issueId + '[:\\s-]*'), '').trim();
}

function projectReport(ctx) {
  const range = report.readRange(common.requestBody(ctx));
  const entries = [];
  let needsRefs = false;
  report.projectIssues(ctx.project, ctx.currentUser).forEach((issue) => {
    const ref = {id: issue.id, summary: issue.summary, url: issue.url, estimateSeconds: common.issueEstimate(issue, ctx.settings)};
    common.readIssueEntries(issue).forEach((entry) => {
      const start = new Date(entry.start).getTime();
      if (entry.deleted || isNaN(start) || start < range.from || start >= range.to) {
        return;
      }
      needsRefs = needsRefs || report.needsRefs(entry, range);
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
  entries.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  return {entries: entries, needsRefs: needsRefs};
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
    },
    {
      scope: 'project',
      method: 'POST',
      path: 'backfill',
      permissions: ['UPDATE_NOT_OWN_WORK_ITEM'],
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'backfill', {from: body.from, to: body.to});
        });
      }
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
