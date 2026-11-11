const assistant = require('./assistant');
const common = require('./common');
const jobs = require('./jobs');

exports.aiTool = {
  name: 'stop_clock',
  description: 'Stops your running clock in the connected time tracking system (e.g. Clockodo), also if it was started outside of YouTrack. If it was started for an issue, ' +
    'the entry is added to that issue, rounded if the app is configured to do so. The request runs in the background: call ' +
    assistant.JOB_RESULT_TOOL + ' with the returned jobId to confirm it.',
  inputSchema: {type: 'object', properties: {}},
  annotations: {
    title: 'Stop clock',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  execute: (ctx) => assistant.run(ctx, () => {
    const clock = common.readClock(ctx.currentUser);
    return assistant.startJob(ctx, 'clockStop', {id: clock ? clock.id : null});
  }),
  asyncFunctions: jobs.asyncFunctions
};
