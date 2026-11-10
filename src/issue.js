const common = require('./common');
const jobs = require('./jobs');

function issueSummary(ctx, lang) {
  const summary = common.issueSummary(ctx.currentUser, lang, common.readIssueEntries(ctx.issue), common.issueEstimate(ctx.issue, ctx.settings));
  return Object.assign(summary, {estimationField: common.projectEstimationField(ctx.issue.project)});
}

exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'GET',
      path: 'summary',
      handle: (ctx) => {
        common.respond(ctx, (lang) => issueSummary(ctx, lang));
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'estimation-field',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          common.saveProjectEstimationField(ctx.issue.project, body && body.name);
          return issueSummary(ctx, lang);
        });
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'refresh',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'refresh', {issueId: ctx.issue.id}));
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'form',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'issueForm', {}));
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'entries',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'create', {body: common.requestBody(ctx)}));
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'update',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'update', {id: body.id, body: body.entry || {}});
        });
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'clock/start',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'clockStart', {body: common.requestBody(ctx)}));
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'clock/stop',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'clockStop', {}));
      }
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
