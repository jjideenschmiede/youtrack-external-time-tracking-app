const common = require('./common');
const jobs = require('./jobs');
const report = require('./report');

function projectReport(ctx) {
  const range = report.readRange(common.requestBody(ctx));
  return report.collect(ctx.project, ctx.currentUser, range, ctx.settings);
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
