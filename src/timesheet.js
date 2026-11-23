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
      path: 'absences',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'absenceCreate', {body: common.requestBody(ctx)}));
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'absences/cancel',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'absenceCancel', {id: body.id, requested: body.requested});
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
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'update',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          return jobs.start(ctx, lang, 'update', {id: body.id, body: body.entry || {}, previousText: body.previousText});
        });
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'clock',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'clockStatus', {}));
      }
    },
    {
      scope: 'global',
      method: 'POST',
      path: 'clock/stop',
      handle: (ctx) => {
        common.respond(ctx, (lang) => jobs.start(ctx, lang, 'clockStop', {id: common.requestBody(ctx).id || null}));
      }
    }
  ],
  asyncFunctions: jobs.asyncFunctions
};
