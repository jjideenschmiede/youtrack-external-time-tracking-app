const common = require('./common');

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
          return common.connect(ctx.currentUser, lang, body.provider, body.credentials);
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
    }
  ]
};
