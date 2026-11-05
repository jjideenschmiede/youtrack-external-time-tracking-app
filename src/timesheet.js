const common = require('./common');
const jobs = require('./jobs');

exports.httpHandler = {
  endpoints: [
    {
      scope: 'global',
      method: 'GET',
      path: 'form',
      handle: (ctx) => {
        common.respond(ctx, (lang) => common.entryForm(ctx.currentUser, lang, null));
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'options',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'options', {field: body.field, refs: body.refs || {}});
        });
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'list',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'entries', {from: body.from, to: body.to});
        });
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'calendar',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'calendar', {fromDate: body.fromDate, toDate: body.toDate});
        });
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'entries',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'create', {body: common.requestBody(ctx)}));
      }
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
