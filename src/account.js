const common = require('./common');
const jobs = require('./jobs');

exports.httpHandler = {
  endpoints: [
    {
      scope: 'global',
      method: 'GET',
      path: 'status',
      handle: (ctx) => {
        common.respond(ctx, (lang) => common.accountStatus(ctx.currentUser, lang));
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'connect',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'connect', {provider: body.provider, credentials: body.credentials});
        });
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'disconnect',
      handle: (ctx) => {
        common.respond(ctx, (lang) => common.disconnect(ctx.currentUser, lang));
      }
    },
    {
      scope: 'global',
      method: 'GET',
      path: 'job',
      handle: (ctx) => {
        common.respond(ctx, () => jobs.readJob(ctx.currentUser, ctx.request.getParameter('id')));
      }
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
