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
        common.respond(ctx, (lang) => common.issueSummary(ctx.currentUser, lang, common.readIssueEntries(ctx.issue)));
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
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
