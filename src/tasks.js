const entities = require('@jetbrains/youtrack-scripting-api/entities');
const common = require('./common');
const providers = require('./providers');
const report = require('./report');
const i18n = require('./i18n');

const DAY = 24 * 3600 * 1000;
const ENTRIES_MAX_DAYS = 62;
const REFRESH_WINDOW_DAYS = 60;
const LOCK_MAX_AGE = 24 * 3600 * 1000;

function done(result) {
  return {result: result};
}

function send(request) {
  return {request: request};
}

function optionsKey(field, refs) {
  return 'options:' + field + ':' + (field === 'project' && refs && refs.customer ? refs.customer : '');
}

function cachedMatch(user, field, refs, value) {
  const cached = common.readCache(user, optionsKey(field, refs));
  if (!cached) {
    return null;
  }
  const wanted = value.trim().toLowerCase();
  return cached.data.options.find((option) => String(option.label).trim().toLowerCase() === wanted) || null;
}

function refKey(refs) {
  return ['customer', 'project', 'service']
    .map((key) => (refs && refs[key] ? refs[key].id : ''))
    .join('|');
}

function advanceForm(job, env) {
  const state = job.state;
  const provider = providers.find(job.provider);
  const fields = state.form.fields;
  const refs = state.form.defaults.refs;
  while (state.index < fields.length) {
    const field = fields[state.index];
    const sourceField = env.settings[field.key + 'Field'];
    if (!sourceField) {
      state.index++;
      continue;
    }
    const value = common.readFieldValue(env.issue, env.user, sourceField);
    if (!value) {
      if (refs[field.key]) {
        refs[field.key] = null;
        common.clearDependents(fields, refs, state.mapped, field.key);
      }
      state.index++;
      continue;
    }
    const parentRefs = {};
    if (field.dependsOn) {
      parentRefs[field.dependsOn] = refs[field.dependsOn] ? refs[field.dependsOn].id : null;
    }
    state.pending = {field: field.key, label: field.label, value: value, source: sourceField};
    const cached = cachedMatch(env.user, field.key, parentRefs, value);
    if (cached) {
      applyMatch(job, cached);
      continue;
    }
    const request = provider.findRequest(field.key, parentRefs, value);
    if (request) {
      return send(request);
    }
    applyMatch(job, null);
  }
  state.form.mappedFields = state.mapped;
  state.form.warnings = state.warnings;
  return done(state.form);
}

function applyMatch(job, option) {
  const state = job.state;
  const pending = state.pending;
  const refs = state.form.defaults.refs;
  state.pending = null;
  state.index++;
  if (!option) {
    state.warnings.push(i18n.translate(job.lang, 'mappingNotFound', {
      field: pending.label,
      value: pending.value,
      source: pending.source,
      provider: providers.find(job.provider).name
    }));
    return;
  }
  const changed = !refs[pending.field] || refs[pending.field].id !== option.id;
  refs[pending.field] = option;
  state.mapped[pending.field] = pending.source;
  if (changed) {
    common.clearDependents(state.form.fields, refs, state.mapped, pending.field);
  }
}

function refreshEntries(issue, user, provider, remote) {
  const oldest = Date.now() - REFRESH_WINDOW_DAYS * DAY;
  const remoteById = {};
  remote.forEach((entry) => {
    remoteById[entry.id] = entry;
  });
  let changed = false;
  const next = common.readIssueEntries(issue).map((entry) => {
    const own = entry.userLogin === user.login && entry.provider === provider.id &&
      new Date(entry.start).getTime() >= oldest;
    if (!own) {
      return entry;
    }
    const current = remoteById[entry.id];
    if (!current) {
      if (entry.deleted) {
        return entry;
      }
      changed = true;
      return Object.assign({}, entry, {deleted: true, deletedAt: Date.now()});
    }
    if (entry.deleted || current.durationSeconds !== entry.durationSeconds ||
      current.start !== entry.start || current.text !== entry.text ||
      current.billable !== entry.billable || refKey(current.refs) !== refKey(entry.refs)) {
      changed = true;
      return Object.assign({}, entry, {
        start: current.start,
        durationSeconds: current.durationSeconds,
        text: current.text,
        billable: current.billable,
        refs: current.refs,
        deleted: false,
        deletedAt: null
      });
    }
    return entry;
  });
  if (changed) {
    common.writeIssueEntries(issue, next);
  }
  return changed;
}

exports.connect = {
  start: (job, env) => {
    const cleaned = common.cleanCredentials(env.user, job.params.provider, job.params.credentials);
    job.provider = cleaned.provider.id;
    job.params = {};
    return {request: cleaned.provider.verifyRequest(), credentials: cleaned.credentials};
  },
  next: (job, env, request, body) => {
    const provider = providers.find(job.provider);
    const profile = provider.parseVerify(body, env.credentials);
    return done(common.saveConnection(env.user, job.lang, provider, profile, env.credentials));
  }
};

exports.options = {
  cacheKey: (job) => optionsKey(job.params.field, job.params.refs),
  start: (job, env) => {
    const session = common.openSession(env.user, job.lang);
    job.provider = session.provider.id;
    const known = session.provider.entryFields.some((field) => field.key === job.params.field);
    if (!known) {
      i18n.fail('unknownField', {field: job.params.field});
    }
    const request = session.provider.optionsRequest(job.params.field, job.params.refs || {});
    return request ? send(request) : done({options: []});
  },
  next: (job, env, request, items) => done({options: providers.find(job.provider).parseOptions(job.lang, items)})
};

exports.issueForm = {
  start: (job, env) => {
    const session = common.openSession(env.user, job.lang);
    job.provider = session.provider.id;
    job.state = {
      form: common.entryForm(env.user, job.lang, env.issue.project.key),
      index: 0,
      mapped: {},
      warnings: [],
      pending: null
    };
    return advanceForm(job, env);
  },
  next: (job, env, request, items) => {
    applyMatch(job, providers.find(job.provider).matchOption(items, job.state.pending.value));
    return advanceForm(job, env);
  }
};

function lockIsStale(account) {
  return !account.lock || !account.lock.checkedAt || Date.now() - account.lock.checkedAt > LOCK_MAX_AGE;
}

function findIssue(id) {
  try {
    return entities.Issue.findById(id);
  } catch {
    return null;
  }
}

function patchStoredEntry(issue, user, entry, refs) {
  let changed = false;
  const entries = common.readIssueEntries(issue).map((stored) => {
    if (stored.id !== entry.id || stored.userLogin !== user.login) {
      return stored;
    }
    changed = true;
    return Object.assign({}, stored, {
      start: entry.start,
      durationSeconds: entry.durationSeconds,
      text: entry.text,
      billable: entry.billable,
      refs: refs,
      deleted: false,
      deletedAt: null
    });
  });
  if (changed) {
    common.writeIssueEntries(issue, entries);
  }
  return entries;
}

exports.entries = {
  start: (job, env) => {
    const session = common.openSession(env.user, job.lang);
    job.provider = session.provider.id;
    const range = common.readRange(job.params.from, job.params.to, ENTRIES_MAX_DAYS, 'rangeTooLong');
    job.state = {range: range};
    if (lockIsStale(session.account)) {
      return send(session.provider.verifyRequest());
    }
    return send(session.provider.entriesRequest(session.account, range, true, false));
  },
  next: (job, env, request, data) => {
    const provider = providers.find(job.provider);
    if (!request.list) {
      common.updateLock(env.user, provider.parseVerify(data, env.credentials).lock);
      return send(provider.entriesRequest(common.readAccount(env.user).account, job.state.range, true, false));
    }
    return done({
      entries: common.linkIssues(provider.parseEntries(data), env.user),
      account: common.publicAccount(env.user, job.lang)
    });
  }
};

exports.update = {
  start: (job, env) => {
    const session = common.openSession(env.user, job.lang);
    job.provider = session.provider.id;
    const id = String(job.params.id || '');
    if (!id) {
      i18n.fail('invalidBody');
    }
    if (env.issue && !common.readIssueEntries(env.issue).some((entry) => entry.id === id && entry.userLogin === env.user.login)) {
      i18n.fail('entryNotEditable');
    }
    const input = common.validateInput(session.provider, job.params.body);
    job.state = {id: id, input: input, labels: job.params.body.labels || {}, previousText: String(job.params.previousText || '')};
    job.params = {};
    return send(session.provider.updateRequest(id, input));
  },
  next: (job, env, request, body) => {
    const provider = providers.find(job.provider);
    const entry = provider.parseUpdate(body);
    const refs = common.labelRefs(job.state.input, job.state.labels);
    if (env.issue) {
      return done(common.issueSummary(env.user, job.lang, patchStoredEntry(env.issue, env.user, entry, refs)));
    }
    const ids = {};
    ((entry.text + ' ' + job.state.previousText).match(common.ISSUE_ID_PATTERN) || []).forEach((issueId) => {
      ids[issueId] = true;
    });
    Object.keys(ids).slice(0, 20).forEach((issueId) => {
      const issue = findIssue(issueId);
      if (issue) {
        patchStoredEntry(issue, env.user, entry, refs);
      }
    });
    return done({entry: entry});
  }
};

exports.calendar = {
  cacheKey: (job) => 'calendar:' + job.params.fromDate + ':' + job.params.toDate,
  start: (job, env) => {
    const session = common.openSession(env.user, job.lang);
    job.provider = session.provider.id;
    const range = common.readDateRange(job.params.fromDate, job.params.toDate);
    if (typeof session.provider.calendarRequests !== 'function') {
      return done({absences: [], holidays: []});
    }
    job.state = {range: range, queue: session.provider.calendarRequests(session.account, range), results: []};
    return send(job.state.queue.shift());
  },
  next: (job, env, request, body) => {
    job.state.results.push({key: request.key, body: body});
    if (job.state.queue.length > 0) {
      return send(job.state.queue.shift());
    }
    return done(providers.find(job.provider).parseCalendar(job.lang, job.state.range, job.state.results));
  }
};

exports.create = {
  start: (job, env) => {
    const session = common.openSession(env.user, job.lang);
    job.provider = session.provider.id;
    const input = common.validateInput(session.provider, job.params.body);
    job.state = {input: input, labels: job.params.body.labels || {}};
    job.params = {};
    return send(session.provider.createRequest(input));
  },
  next: (job, env, request, body) => {
    const provider = providers.find(job.provider);
    const entry = provider.parseCreate(body);
    const projectKey = env.issue ? env.issue.project.key : null;
    const refs = common.rememberCreated(env.user, projectKey, job.state.input, job.state.labels);
    if (!env.issue) {
      return done({entry: entry});
    }
    const entries = common.readIssueEntries(env.issue);
    entries.push({
      id: entry.id,
      provider: provider.id,
      start: entry.start,
      durationSeconds: entry.durationSeconds,
      text: entry.text,
      billable: entry.billable,
      refs: refs,
      userLogin: env.user.login,
      userName: env.user.visibleName
    });
    common.writeIssueEntries(env.issue, entries);
    common.indexIssue(env.issue);
    return done(common.issueSummary(env.user, job.lang, entries));
  }
};

exports.refresh = {
  start: (job, env) => {
    const connection = common.readAccount(env.user);
    if (!connection) {
      return done({changed: false});
    }
    const oldest = Date.now() - REFRESH_WINDOW_DAYS * DAY;
    const starts = common.readIssueEntries(env.issue)
      .filter((entry) => entry.userLogin === env.user.login && entry.provider === connection.provider.id &&
        new Date(entry.start).getTime() >= oldest)
      .map((entry) => new Date(entry.start).getTime());
    if (starts.length === 0) {
      return done({changed: false});
    }
    const session = common.openSession(env.user, job.lang);
    job.provider = session.provider.id;
    return send(session.provider.entriesRequest(session.account, {
      from: new Date(Math.min.apply(null, starts) - DAY).toISOString(),
      to: new Date(Math.max.apply(null, starts) + 2 * DAY).toISOString()
    }, true, false));
  },
  next: (job, env, request, items) => {
    const provider = providers.find(job.provider);
    return done({changed: refreshEntries(env.issue, env.user, provider, provider.parseEntries(items))});
  }
};

exports.backfill = {
  start: (job, env) => {
    if (!common.readAccount(env.user)) {
      return done({changed: false});
    }
    const session = common.openSession(env.user, job.lang);
    const range = report.readRange(job.params);
    let from = Infinity;
    let to = -Infinity;
    report.projectIssues(env.project, env.user).forEach((issue) => {
      common.readIssueEntries(issue).forEach((entry) => {
        if (entry.provider === session.provider.id && report.needsRefs(entry, range)) {
          const start = new Date(entry.start).getTime();
          from = Math.min(from, start);
          to = Math.max(to, start);
        }
      });
    });
    if (from === Infinity) {
      return done({changed: false});
    }
    job.provider = session.provider.id;
    job.state = {range: range};
    return send(session.provider.entriesRequest(session.account, {
      from: new Date(from - DAY).toISOString(),
      to: new Date(to + 2 * DAY).toISOString()
    }, true, true));
  },
  next: (job, env, request, items) => {
    const provider = providers.find(job.provider);
    const remote = {};
    provider.parseEntries(items).forEach((entry) => {
      remote[entry.id] = entry;
    });
    let changed = false;
    report.projectIssues(env.project, env.user).forEach((issue) => {
      let issueChanged = false;
      const entries = common.readIssueEntries(issue).map((entry) => {
        if (entry.provider !== provider.id || !report.needsRefs(entry, job.state.range)) {
          return entry;
        }
        issueChanged = true;
        const current = remote[entry.id];
        return current && report.hasRefs(current)
          ? Object.assign({}, entry, {refs: current.refs})
          : Object.assign({}, entry, {refsChecked: true});
      });
      if (issueChanged) {
        changed = true;
        common.writeIssueEntries(issue, entries);
      }
    });
    return done({changed: changed});
  }
};
