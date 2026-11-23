const entities = require('@jetbrains/youtrack-scripting-api/entities');
const providers = require('./providers');
const i18n = require('./i18n');

const ISSUE_ID_PATTERN = /\b[A-Z][A-Z0-9_]*-\d+\b/g;
const MAX_ISSUE_REFS = 200;
const CACHE_FRESH = 10 * 60 * 1000;
const CACHE_MAX_AGE = 24 * 3600 * 1000;
const CACHE_MAX_KEYS = 80;
const MAX_LABEL_LENGTH = 200;
const MAX_NOTE_LENGTH = 512;

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function respond(ctx, produce) {
  const lang = i18n.language(ctx);
  try {
    ctx.response.json(produce(lang));
  } catch (e) {
    const message = i18n.errorMessage(lang, e);
    console.error('external-time-tracking: ' + message + (e && e.stack ? '\n' + e.stack : ''));
    ctx.response.json({error: message});
  }
}

function requestBody(ctx) {
  try {
    return ctx.request.json() || {};
  } catch {
    return i18n.fail('invalidBody');
  }
}

function isGuest(user) {
  return !user || user.login === 'guest';
}

function readAccount(user) {
  if (isGuest(user)) {
    return null;
  }
  const account = parseJson(user.extensionProperties.timeTrackingAccount, null);
  if (!account) {
    return null;
  }
  const provider = providers.find(account.provider);
  if (!provider) {
    return null;
  }
  return {account: account, provider: provider};
}

function openSession(user, lang) {
  const connection = readAccount(user);
  if (!connection) {
    i18n.fail('notConnected');
  }
  const credentials = parseJson(user.extensionProperties.timeTrackingCredentials, null);
  if (!credentials) {
    i18n.fail('credentialsMissing');
  }
  return {
    provider: connection.provider,
    account: connection.account,
    credentials: credentials,
    lang: lang
  };
}

function publicAccount(user, lang) {
  const connection = readAccount(user);
  if (!connection) {
    return null;
  }
  return {
    provider: connection.provider.id,
    providerName: connection.provider.name,
    name: connection.account.name,
    email: connection.account.email,
    company: connection.account.company || null,
    lock: connection.account.lock || null,
    links: providers.links(connection.provider, lang),
    absenceTypes: typeof connection.provider.absenceTypes === 'function' ? connection.provider.absenceTypes(lang) : []
  };
}

function accountStatus(user, lang) {
  return {
    providers: providers.all().map((provider) => providers.describe(provider, lang)),
    account: publicAccount(user, lang)
  };
}

function saveConnection(user, lang, provider, profile, credentials) {
  user.extensionProperties.timeTrackingAccount = JSON.stringify({
    provider: provider.id,
    externalUserId: profile.externalUserId,
    name: profile.name,
    email: profile.email,
    company: profile.company,
    lock: profile.lock || null,
    connectedAt: Date.now()
  });
  user.extensionProperties.timeTrackingCredentials = JSON.stringify(credentials);
  user.extensionProperties.timeTrackingPreferences = null;
  user.extensionProperties.timeTrackingCache = null;
  user.extensionProperties.timeTrackingClock = null;
  return accountStatus(user, lang);
}

function cleanCredentials(user, providerId, credentials) {
  if (isGuest(user)) {
    i18n.fail('guestNotAllowed');
  }
  const provider = providers.find(providerId);
  if (!provider) {
    i18n.fail('unknownProvider', {provider: providerId});
  }
  const cleaned = {};
  provider.credentialFields.forEach((field) => {
    const value = credentials && typeof credentials[field.key] === 'string' ? credentials[field.key].trim() : '';
    if (!value) {
      i18n.fail('fieldMissing', {field: field.label});
    }
    cleaned[field.key] = value;
  });
  return {provider: provider, credentials: cleaned};
}

function updateLock(user, lock) {
  const account = parseJson(user.extensionProperties.timeTrackingAccount, null);
  if (account && lock) {
    account.lock = lock;
    user.extensionProperties.timeTrackingAccount = JSON.stringify(account);
  }
}

function disconnect(user, lang) {
  user.extensionProperties.timeTrackingAccount = null;
  user.extensionProperties.timeTrackingCredentials = null;
  user.extensionProperties.timeTrackingPreferences = null;
  user.extensionProperties.timeTrackingCache = null;
  user.extensionProperties.timeTrackingClock = null;
  return accountStatus(user, lang);
}

function readPreferences(user) {
  return parseJson(user.extensionProperties.timeTrackingPreferences, {byProject: {}, last: null});
}

function entryForm(user, lang, projectKey) {
  const session = openSession(user, lang);
  const preferences = readPreferences(user);
  const remembered = projectKey ? preferences.byProject[projectKey] : preferences.last;
  const preset = remembered || {refs: {}, billable: true};
  const refs = {};
  session.provider.entryFields.forEach((field) => {
    refs[field.key] = preset.refs && preset.refs[field.key] ? preset.refs[field.key] : null;
  });
  return {
    providerName: session.provider.name,
    fields: providers.entryFields(session.provider, lang),
    supportsBillable: session.provider.supportsBillable,
    defaults: {refs: refs, billable: preset.billable !== false}
  };
}

function readFieldValue(issue, user, fieldName) {
  try {
    if (!issue.fields.canBeReadBy(fieldName, user)) {
      return null;
    }
    const value = issue.fields[fieldName];
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim() || null;
    }
    if (value.name) {
      return String(value.name).trim() || null;
    }
    if (typeof value.first === 'function' && value.first() && value.first().name) {
      return String(value.first().name).trim() || null;
    }
  } catch (e) {
    console.warn('external-time-tracking: cannot read field "' + fieldName + '": ' + e.message);
  }
  return null;
}

function firstCustomerGroup(issue) {
  try {
    const groups = issue && issue.customerGroups;
    const first = groups && !groups.isEmpty() ? groups.first() : null;
    return first && first.name ? String(first.name).trim() || null : null;
  } catch (e) {
    console.warn('external-time-tracking: cannot read customer groups: ' + e.message);
    return null;
  }
}

function clearDependents(fields, refs, mapped, parentKey) {
  fields.forEach((child) => {
    if (child.dependsOn === parentKey && !mapped[child.key]) {
      refs[child.key] = null;
    }
  });
}

function rememberSelection(user, projectKey, refs, billable) {
  const preferences = readPreferences(user);
  const entry = {refs: refs, billable: billable};
  preferences.last = entry;
  if (projectKey) {
    preferences.byProject[projectKey] = entry;
  }
  user.extensionProperties.timeTrackingPreferences = JSON.stringify(preferences);
}

function validateDetails(provider, body) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    i18n.fail('textRequired');
  }
  const refs = {};
  provider.entryFields.forEach((field) => {
    const value = body.refs && body.refs[field.key] ? String(body.refs[field.key]) : null;
    if (field.required && !value) {
      i18n.fail('fieldRequired', {field: field.label});
    }
    refs[field.key] = value;
  });
  return {text: text, billable: body.billable === true, refs: refs};
}

function validateInput(provider, body) {
  const start = new Date(body.start);
  const end = new Date(body.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    i18n.fail('invalidTimes');
  }
  if (end.getTime() <= start.getTime()) {
    i18n.fail('endBeforeStart');
  }
  if (end.getTime() - start.getTime() > 24 * 3600 * 1000) {
    i18n.fail('entryTooLong');
  }
  const details = validateDetails(provider, body);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    text: details.text,
    billable: details.billable,
    refs: details.refs
  };
}

function labelRefs(input, labels) {
  const refs = {};
  Object.keys(input.refs).forEach((key) => {
    refs[key] = input.refs[key]
      ? {id: input.refs[key], name: labels && labels[key] ? String(labels[key]).slice(0, MAX_LABEL_LENGTH) : input.refs[key]}
      : null;
  });
  return refs;
}

function rememberCreated(user, projectKey, input, labels) {
  const refs = labelRefs(input, labels);
  const remembered = {};
  Object.keys(refs).forEach((key) => {
    remembered[key] = refs[key] ? {id: refs[key].id, label: refs[key].name} : null;
  });
  rememberSelection(user, projectKey, remembered, input.billable);
  return refs;
}

function linkIssues(entries, user) {
  const refs = issueRefs(entries.map((entry) => entry.text), user);
  entries.forEach((entry) => {
    const found = (entry.text.match(ISSUE_ID_PATTERN) || [])
      .map((id) => refs[id])
      .filter((ref) => !!ref);
    entry.issues = found.filter((ref, index) => found.findIndex((other) => other.id === ref.id) === index);
  });
  entries.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return entries;
}

function readRange(from, to, maxDays, tooLongKey) {
  const range = {from: new Date(from), to: new Date(to)};
  if (isNaN(range.from.getTime()) || isNaN(range.to.getTime()) || range.to <= range.from) {
    i18n.fail('invalidRange');
  }
  if (range.to.getTime() - range.from.getTime() > maxDays * 24 * 3600 * 1000) {
    i18n.fail(tooLongKey);
  }
  return {from: range.from.toISOString(), to: range.to.toISOString()};
}

function validateAbsence(provider, lang, body) {
  if (typeof provider.createAbsenceRequest !== 'function' || !body) {
    i18n.fail('invalidBody');
  }
  const type = String(body.type || '');
  if (!provider.absenceTypes(lang).some((option) => option.id === type)) {
    i18n.fail('invalidBody');
  }
  const range = readDateRange(body.fromDate, body.toDate);
  return {
    type: type,
    fromDate: range.fromDate,
    toDate: range.toDate,
    halfDay: body.halfDay === true && range.fromDate === range.toDate,
    note: String(body.note || '').trim().slice(0, MAX_NOTE_LENGTH)
  };
}

function readDateRange(fromDate, toDate) {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(fromDate || '') || !pattern.test(toDate || '') || toDate < fromDate) {
    i18n.fail('invalidRange');
  }
  return {fromDate: fromDate, toDate: toDate};
}

const DEFAULT_ESTIMATION_FIELD = 'Estimation';
const SPENT_TIME_FIELD = 'Spent time';
const MINUTES_PER_DAY = 8 * 60;
const DAYS_PER_WEEK = 5;

function periodPart(period, method) {
  return typeof period[method] === 'function' ? Number(period[method]()) || 0 : 0;
}

function projectEstimationField(project) {
  try {
    return project && project.isTimeTrackingEnabled ? project.extensionProperties.timeTrackingEstimateField || null : null;
  } catch {
    return null;
  }
}

function saveProjectEstimationField(project, name) {
  const value = typeof name === 'string' && name.trim() && project.findFieldByName(name.trim()) ? name.trim() : null;
  if ((project.extensionProperties.timeTrackingEstimateField || null) !== value) {
    project.extensionProperties.timeTrackingEstimateField = value;
  }
}

function defaultEstimationField(project) {
  const periods = [];
  try {
    project.fields.forEach((field) => {
      if (field.typeName === 'period' && field.name !== SPENT_TIME_FIELD) {
        periods.push(field.name);
      }
    });
  } catch {
    return null;
  }
  if (periods.indexOf(DEFAULT_ESTIMATION_FIELD) !== -1) {
    return DEFAULT_ESTIMATION_FIELD;
  }
  return periods.length === 1 ? periods[0] : null;
}

function estimationField(project, settings) {
  const configured = settings && typeof settings.estimationField === 'string' ? settings.estimationField.trim() : '';
  return configured || (project ? projectEstimationField(project) || defaultEstimationField(project) : null);
}

function fieldEstimate(issue, user, fieldName) {
  if (!issue || !fieldName) {
    return null;
  }
  let period;
  try {
    if (!issue.fields.canBeReadBy(fieldName, user)) {
      return null;
    }
    period = issue.fields[fieldName];
  } catch {
    return null;
  }
  if (!period || typeof period.getMinutes !== 'function') {
    return null;
  }
  const days = periodPart(period, 'getDays') + DAYS_PER_WEEK * periodPart(period, 'getWeeks');
  const minutes = periodPart(period, 'getMinutes') + 60 * periodPart(period, 'getHours') + MINUTES_PER_DAY * days;
  return minutes > 0 ? minutes * 60 : null;
}

function issueEstimate(issue, user, settings) {
  return fieldEstimate(issue, user, issue ? estimationField(issue.project, settings) : null);
}

function readClock(user) {
  return parseJson(user.extensionProperties.timeTrackingClock, null);
}

function writeClock(user, clock) {
  const next = clock ? JSON.stringify(clock) : null;
  if (user.extensionProperties.timeTrackingClock !== next) {
    user.extensionProperties.timeTrackingClock = next;
  }
  const remind = !!(clock && clock.issueId && !clock.reminded);
  if (!!user.extensionProperties.timeTrackingClockReminder !== remind) {
    user.extensionProperties.timeTrackingClockReminder = remind;
  }
}

function publicClock(user) {
  const clock = readClock(user);
  if (!clock) {
    return null;
  }
  const refs = issueRefs([clock.issueId || clock.text || ''], user);
  const found = Object.keys(refs).map((id) => refs[id]).filter(Boolean);
  const issue = clock.issueId ? refs[clock.issueId] : found[0];
  return {
    id: clock.id,
    start: clock.start,
    text: clock.text,
    issueId: clock.issueId || null,
    issue: issue || null,
    refs: clock.refs || {}
  };
}

function issueSummary(user, lang, entries, estimateSeconds) {
  let total = 0;
  const visible = entries
    .map((entry) => {
      if (!entry.deleted) {
        total += entry.durationSeconds;
      }
      return Object.assign({}, entry, {mine: entry.userLogin === user.login, deleted: entry.deleted === true});
    })
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

  return {
    account: publicAccount(user, lang),
    totalSeconds: total,
    estimateSeconds: estimateSeconds || null,
    clock: publicClock(user),
    entries: visible
  };
}

function writeIssueEntries(issue, entries) {
  issue.extensionProperties.timeTrackingEntries = entries.length > 0 ? JSON.stringify(entries) : null;
}

function readCache(user, key) {
  const cache = parseJson(user.extensionProperties.timeTrackingCache, {});
  const cached = cache && cache[key];
  const age = cached ? Date.now() - cached.at : Infinity;
  if (!cached || age > CACHE_MAX_AGE) {
    return null;
  }
  return {data: cached.data, fresh: age < CACHE_FRESH};
}

function writeCache(user, key, data) {
  const now = Date.now();
  const cache = parseJson(user.extensionProperties.timeTrackingCache, {}) || {};
  cache[key] = {at: now, data: data};
  const kept = {};
  Object.keys(cache)
    .filter((name) => cache[name] && now - cache[name].at <= CACHE_MAX_AGE)
    .sort((a, b) => cache[b].at - cache[a].at)
    .slice(0, CACHE_MAX_KEYS)
    .forEach((name) => {
      kept[name] = cache[name];
    });
  user.extensionProperties.timeTrackingCache = JSON.stringify(kept);
}

function dropCache(user, prefix) {
  const cache = parseJson(user.extensionProperties.timeTrackingCache, {}) || {};
  const kept = {};
  Object.keys(cache)
    .filter((name) => name.indexOf(prefix) !== 0)
    .forEach((name) => {
      kept[name] = cache[name];
    });
  user.extensionProperties.timeTrackingCache = Object.keys(kept).length > 0 ? JSON.stringify(kept) : null;
}

function readIssueEntries(issue) {
  const entries = parseJson(issue.extensionProperties.timeTrackingEntries, []);
  return Array.isArray(entries) ? entries : [];
}

function readProjectIndex(project) {
  const index = parseJson(project.extensionProperties.timeTrackingIssues, null);
  return index && Array.isArray(index.issues) ? index : null;
}

function writeProjectIndex(project, index) {
  project.extensionProperties.timeTrackingIssues = JSON.stringify(index);
}

function indexIssue(issue) {
  const index = readProjectIndex(issue.project) || {complete: false, issues: []};
  if (index.issues.indexOf(issue.id) === -1) {
    index.issues.push(issue.id);
    writeProjectIndex(issue.project, index);
  }
}

function issueRefs(texts, currentUser) {
  const cache = {};
  const ids = [];
  texts.forEach((text) => {
    (text.match(ISSUE_ID_PATTERN) || []).forEach((id) => {
      if (!(id in cache) && ids.length < MAX_ISSUE_REFS) {
        cache[id] = null;
        ids.push(id);
      }
    });
  });

  ids.forEach((id) => {
    let issue = null;
    try {
      issue = entities.Issue.findById(id);
    } catch {
      issue = null;
    }
    if (issue && issue.isVisibleTo(currentUser)) {
      cache[id] = {id: issue.id, summary: issue.summary, url: issue.url};
    }
  });
  return cache;
}

exports.parseJson = parseJson;
exports.respond = respond;
exports.requestBody = requestBody;
exports.readAccount = readAccount;
exports.openSession = openSession;
exports.publicAccount = publicAccount;
exports.accountStatus = accountStatus;
exports.cleanCredentials = cleanCredentials;
exports.saveConnection = saveConnection;
exports.updateLock = updateLock;
exports.disconnect = disconnect;
exports.ISSUE_ID_PATTERN = ISSUE_ID_PATTERN;
exports.entryForm = entryForm;
exports.readFieldValue = readFieldValue;
exports.firstCustomerGroup = firstCustomerGroup;
exports.clearDependents = clearDependents;
exports.validateInput = validateInput;
exports.labelRefs = labelRefs;
exports.rememberCreated = rememberCreated;
exports.linkIssues = linkIssues;
exports.readRange = readRange;
exports.readDateRange = readDateRange;
exports.issueSummary = issueSummary;
exports.validateDetails = validateDetails;
exports.readClock = readClock;
exports.writeClock = writeClock;
exports.publicClock = publicClock;
exports.issueEstimate = issueEstimate;
exports.estimationField = estimationField;
exports.fieldEstimate = fieldEstimate;
exports.projectEstimationField = projectEstimationField;
exports.saveProjectEstimationField = saveProjectEstimationField;
exports.readCache = readCache;
exports.writeCache = writeCache;
exports.dropCache = dropCache;
exports.validateAbsence = validateAbsence;
exports.readIssueEntries = readIssueEntries;
exports.writeIssueEntries = writeIssueEntries;
exports.readProjectIndex = readProjectIndex;
exports.writeProjectIndex = writeProjectIndex;
exports.indexIssue = indexIssue;
