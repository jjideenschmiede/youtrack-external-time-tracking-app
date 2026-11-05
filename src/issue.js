const common = require('./common');
const jobs = require('./jobs');

exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'GET',
      path: 'summary',
      handle: (ctx) => {
        common.respond(ctx, (lang) => common.issueSummary(ctx.currentUser, lang, common.readIssueEntries(ctx.issue), common.issueEstimate(ctx.issue, ctx.settings)));
      }
    },
    {
      scope: 'issue',
      permissions: ['CREATE_WORK_ITEM'],
      method: 'POST',
      path: 'refresh',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'refresh', {}));
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
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
