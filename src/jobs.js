const common = require('./common');
const providers = require('./providers');
const tasks = require('./tasks');
const i18n = require('./i18n');

const HANDLER = 'onProviderResponse';
const PENDING_TTL = 10 * 60 * 1000;
const FINISHED_TTL = 60 * 1000;
const MAX_JOBS = 8;
const MAX_PAGES = 8;

function readJobs(user) {
  const jobs = common.parseJson(user.extensionProperties.timeTrackingJobs, {});
  return jobs && typeof jobs === 'object' ? jobs : {};
}

function writeJobs(user, jobs) {
  user.extensionProperties.timeTrackingJobs = Object.keys(jobs).length > 0 ? JSON.stringify(jobs) : null;
}

function pruneJobs(jobs) {
  const now = Date.now();
  const kept = {};
  Object.keys(jobs)
    .filter((id) => {
      const job = jobs[id];
      const age = job ? now - (job.finished || job.created) : Infinity;
      return job && age < (job.status === 'pending' ? PENDING_TTL : FINISHED_TTL);
    })
    .sort((a, b) => jobs[b].created - jobs[a].created)
    .slice(0, MAX_JOBS - 1)
    .forEach((id) => {
      kept[id] = jobs[id];
    });
  return kept;
}

function environment(ctx, credentials) {
  return {
    user: ctx.currentUser,
    issue: ctx.issue || null,
    project: ctx.project || null,
    settings: ctx.settings || {},
    credentials: credentials
  };
}

function savedCredentials(user) {
  return common.parseJson(user.extensionProperties.timeTrackingCredentials, null);
}

function dispatch(ctx, job, request, credentials, pendingCredentials) {
  const provider = providers.find(job.provider);
  const connection = provider.connection(credentials, job.lang);
  const query = provider.pageQuery(request);
  job.request = request;
  ctx.store('jobId', job.id);
  if (pendingCredentials) {
    ctx.store('credentials', JSON.stringify(credentials));
  }
  if (request.method === 'POST') {
    connection.postAsync(request.path, query, JSON.stringify(request.payload || {}), HANDLER);
  } else if (request.method === 'PUT') {
    connection.putAsync(request.path, query, JSON.stringify(request.payload || {}), HANDLER);
  } else {
    connection.getAsync(request.path, query, HANDLER);
  }
}

function start(ctx, lang, kind, params) {
  const user = ctx.currentUser;
  const job = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind: kind,
    lang: lang,
    params: params || {},
    state: {},
    buffer: [],
    status: 'pending',
    created: Date.now()
  };
  const task = tasks[kind];
  const cacheKey = task.cacheKey ? task.cacheKey(job) : null;
  const cached = cacheKey ? common.readCache(user, cacheKey) : null;
  if (cached && cached.fresh) {
    return cached.data;
  }
  job.cacheKey = cacheKey;
  const step = task.start(job, environment(ctx, null));
  if (!step.request) {
    return step.result;
  }
  const pendingCredentials = !!step.credentials;
  const credentials = step.credentials || savedCredentials(user);
  dispatch(ctx, job, step.request, credentials, pendingCredentials);
  const jobs = pruneJobs(readJobs(user));
  jobs[job.id] = job;
  writeJobs(user, jobs);
  return cached ? cached.data : {job: job.id};
}

function readBody(response) {
  if (!response.response) {
    return {};
  }
  return JSON.parse(response.response);
}

function finish(job, result) {
  job.status = 'done';
  job.finished = Date.now();
  job.result = result;
  job.params = {};
  job.state = {};
  job.buffer = [];
  job.request = null;
}

function onProviderResponse(ctx) {
  const user = ctx.currentUser;
  const id = ctx.load('jobId');
  const jobs = readJobs(user);
  const job = jobs[id];
  if (!job || job.status !== 'pending') {
    return;
  }
  const stored = ctx.load('credentials');
  const pendingCredentials = !!stored;
  const credentials = pendingCredentials ? common.parseJson(stored, null) : savedCredentials(user);
  try {
    const provider = providers.find(job.provider);
    const request = job.request;
    const response = ctx.response;
    let body = null;
    if (response && response.isSuccess) {
      body = readBody(response);
    } else if (!request.optional) {
      provider.fail(response || {code: 0, response: null});
    }
    let data = body;
    if (request.list) {
      job.buffer = job.buffer.concat(body ? body[request.list] || [] : []);
      const more = body ? provider.nextPage(request, body) : null;
      if (more && more.page <= MAX_PAGES) {
        dispatch(ctx, job, more, credentials, pendingCredentials);
        writeJobs(user, jobs);
        return;
      }
      data = job.buffer;
      job.buffer = [];
    }
    const step = tasks[job.kind].next(job, environment(ctx, credentials), request, data);
    if (step.request) {
      dispatch(ctx, job, step.request, credentials, pendingCredentials);
    } else {
      finish(job, step.result);
      if (job.cacheKey) {
        common.writeCache(user, job.cacheKey, step.result);
      }
    }
  } catch (e) {
    const message = i18n.errorMessage(job.lang, e);
    console.warn('external-time-tracking: ' + job.kind + ' failed: ' + message);
    job.status = 'error';
    job.finished = Date.now();
    job.error = message;
    job.params = {};
    job.state = {};
    job.buffer = [];
    job.request = null;
  }
  writeJobs(user, jobs);
}

function readJob(user, id) {
  const job = readJobs(user)[id];
  if (!job) {
    i18n.fail('jobNotFound');
  }
  if (job.status === 'error') {
    i18n.failRaw(job.error);
  }
  return job.status === 'done' ? {status: 'done', result: job.result} : {status: 'pending'};
}

exports.start = start;
exports.readJob = readJob;
exports.asyncFunctions = {
  onProviderResponse: onProviderResponse
};
