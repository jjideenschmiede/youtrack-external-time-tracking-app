const assistant = require('./assistant');
const jobs = require('./jobs');

exports.aiTool = {
  name: 'clock_status',
  description: 'Tells whether your clock (stopwatch) is running in the connected time tracking system (e.g. Clockodo), ' +
    'since when and for which YouTrack issue. The request runs in the background: call ' + assistant.JOB_RESULT_TOOL +
    ' with the returned jobId to get the status.',
  inputSchema: {type: 'object', properties: {}},
  annotations: {
    title: 'Clock status',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  execute: (ctx) => assistant.run(ctx, () => assistant.startJob(ctx, 'clockStatus', {})),
  asyncFunctions: jobs.asyncFunctions
};
