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
          return jobs.start(ctx, lang, 'connect', {
            provider: body.provider,
            credentials: body.credentials,
            oauth: body.oauth && typeof body.oauth === 'object' ? body.oauth : null
          });
        });
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'oauth/start',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'oauthStart', {provider: body.provider, redirectUri: body.redirectUri});
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
        common.respond(ctx, () => jobs.jobState(ctx.currentUser, ctx.request.getParameter('id')));
      }
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
