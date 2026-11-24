const entities = require('@jetbrains/youtrack-scripting-api/entities');
const common = require('./common');
const providers = require('./providers');
const tasks = require('./tasks');
const i18n = require('./i18n');

const HANDLER = 'onProviderResponse';
const PENDING_TTL = 10 * 60 * 1000;
const FINISHED_TTL = 10 * 60 * 1000;
const SLOTS = 16;
const REUSABLE_SLOTS = 8;
const MAX_PAGES = 8;

function slotName(index) {
  return 'timeTrackingJob' + index;
}

function slotOf(id) {
  const index = parseInt(String(id || '').split('-')[0], 36);
  return index >= 0 && index < SLOTS ? index : null;
}

function readSlot(user, index) {
  const raw = user.extensionProperties[slotName(index)];
  const split = raw ? raw.indexOf(';') : -1;
  if (split < 0) {
    return null;
  }
  return {expires: Number(raw.slice(0, split)) || 0, body: raw.slice(split + 1)};
}

function readJob(user, id) {
  const index = slotOf(id);
  const slot = index === null ? null : readSlot(user, index);
  const job = slot ? common.parseJson(slot.body, null) : null;
  return job && job.id === id ? job : null;
}

function writeJob(user, job) {
  const ttl = job.status === 'pending' ? PENDING_TTL : FINISHED_TTL;
  const expires = (job.finished || job.created) + ttl;
  user.extensionProperties[slotName(slotOf(job.id))] = expires + ';' + JSON.stringify(job);
}

function pickSlot(user) {
  const now = Date.now();
  const free = [];
  const taken = [];
  for (let index = 0; index < SLOTS; index++) {
    const slot = readSlot(user, index);
    if (!slot || slot.expires <= now) {
      free.push(index);
    } else {
      taken.push({index: index, expires: slot.expires});
    }
  }
  if (free.length > 0) {
    return free[Math.floor(Math.random() * free.length)];
  }
  const oldest = taken.sort((a, b) => a.expires - b.expires).slice(0, REUSABLE_SLOTS);
  return oldest[Math.floor(Math.random() * oldest.length)].index;
}

function findIssue(id) {
  try {
    return id ? entities.Issue.findById(id) : null;
  } catch {
    return null;
  }
}

function environment(ctx, credentials, job) {
  const issue = ctx.issue || findIssue(job && job.issueId);
  return {
    user: ctx.currentUser,
    issue: issue || null,
    project: ctx.project || (issue ? issue.project : null),
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
  } else if (request.method === 'DELETE') {
    connection.deleteAsync(request.path, query, HANDLER);
  } else {
    connection.getAsync(request.path, query, HANDLER);
  }
}

function start(ctx, lang, kind, params) {
  const user = ctx.currentUser;
  if (user.extensionProperties.timeTrackingJobs) {
    user.extensionProperties.timeTrackingJobs = null;
  }
  const job = {
    id: pickSlot(user).toString(36) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    kind: kind,
    lang: lang,
    params: params || {},
    state: {},
    buffer: [],
    status: 'pending',
    created: Date.now(),
    issueId: ctx.issue ? null : (params && params.issueId) || null
  };
  const task = tasks[kind];
  const cacheKey = task.cacheKey ? task.cacheKey(job) : null;
  const cached = cacheKey ? common.readCache(user, cacheKey) : null;
  let cachedData = cached ? cached.data : null;
  if (cached && task.fromCache) {
    cachedData = task.fromCache(cached.data);
  }
  if (cached && cached.fresh) {
    return cachedData;
  }
  job.cacheKey = cacheKey;
  const step = task.start(job, environment(ctx, null, job));
  if (!step.request) {
    return step.result;
  }
  const pendingCredentials = !!step.credentials;
  const credentials = step.credentials || savedCredentials(user);
  dispatch(ctx, job, step.request, credentials, pendingCredentials);
  writeJob(user, job);
  return cached ? cachedData : {job: job.id};
}

function readBody(response) {
  if (!response.response) {
    return {};
  }
  return JSON.parse(response.response);
}

function slim(request, items) {
  if (!request.keep) {
    return items;
  }
  return items.map((item) => {
    const kept = {};
    request.keep.forEach((key) => {
      if (key in item) {
        kept[key] = item[key];
      }
    });
    return kept;
  });
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
  const job = readJob(user, id);
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
      job.buffer = job.buffer.concat(slim(request, body ? body[request.list] || [] : []));
      const more = body ? provider.nextPage(request, body) : null;
      if (more && more.page <= MAX_PAGES) {
        dispatch(ctx, job, more, credentials, pendingCredentials);
        writeJob(user, job);
        return;
      }
      data = job.buffer;
      job.buffer = [];
    }
    const step = tasks[job.kind].next(job, environment(ctx, credentials, job), request, data);
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
  writeJob(user, job);
}

function jobState(user, id) {
  const job = readJob(user, id);
  if (!job) {
    return {status: 'lost'};
  }
  if (job.status === 'error') {
    i18n.failRaw(job.error);
  }
  return job.status === 'done' ? {status: 'done', result: job.result} : {status: 'pending'};
}

exports.start = start;
exports.jobState = jobState;
exports.asyncFunctions = {
  onProviderResponse: onProviderResponse
};
