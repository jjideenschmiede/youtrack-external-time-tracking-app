const common = require('./common');

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
      method: 'GET',
      path: 'options',
      handle: (ctx) => {
        common.respond(ctx, (lang) => ({
          options: common.listOptions(ctx.currentUser, lang, ctx.request.getParameter('field'), common.optionRefs(ctx))
        }));
      }
    },
    {
      scope: 'global',
      method: 'GET',
      path: 'entries',
      handle: (ctx) => {
        common.respond(ctx, (lang) => ({
          entries: common.listEntries(ctx.currentUser, lang, ctx.request.getParameter('from'), ctx.request.getParameter('to'))
        }));
      }
    },
    {
      scope: 'global',
      method: 'GET',
      path: 'calendar',
      handle: (ctx) => {
        common.respond(ctx, (lang) => common.listCalendar(
          ctx.currentUser, lang, ctx.request.getParameter('fromDate'), ctx.request.getParameter('toDate')
        ));
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'entries',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return {entry: common.createEntry(ctx.currentUser, lang, body, null).entry};
        });
      }
    }
  ]
};
