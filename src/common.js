const entities = require('@jetbrains/youtrack-scripting-api/entities');
const providers = require('./providers');
const i18n = require('./i18n');

const ISSUE_ID_PATTERN = /\b[A-Z][A-Z0-9_]*-\d+\b/g;
const MAX_ISSUE_REFS = 200;
const RESERVED_PARAMETERS = ['field', 'lang'];

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

function optionRefs(ctx) {
  const refs = {};
  ctx.request.parameterNames.forEach((name) => {
    if (RESERVED_PARAMETERS.indexOf(name) === -1) {
      refs[name] = ctx.request.getParameter(name);
    }
  });
  return refs;
}

function readAccount(user) {
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
    links: providers.links(connection.provider, lang)
  };
}

function accountStatus(user, lang) {
  return {
    providers: providers.all().map((provider) => providers.describe(provider, lang)),
    account: publicAccount(user, lang)
  };
}

function connect(user, lang, providerId, credentials) {
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

  const profile = provider.verify({provider: provider, account: null, credentials: cleaned, lang: lang});
  user.extensionProperties.timeTrackingAccount = JSON.stringify({
    provider: provider.id,
    externalUserId: profile.externalUserId,
    name: profile.name,
    email: profile.email,
    company: profile.company,
    connectedAt: Date.now()
  });
  user.extensionProperties.timeTrackingCredentials = JSON.stringify(cleaned);
  user.extensionProperties.timeTrackingPreferences = null;
  return accountStatus(user, lang);
}

function disconnect(user, lang) {
  user.extensionProperties.timeTrackingAccount = null;
  user.extensionProperties.timeTrackingCredentials = null;
  user.extensionProperties.timeTrackingPreferences = null;
  return accountStatus(user, lang);
}

function readPreferences(user) {
  return parseJson(user.extensionProperties.timeTrackingPreferences, {byProject: {}, last: null});
}

function entryForm(user, lang, projectKey) {
  const session = openSession(user, lang);
  const preferences = readPreferences(user);
  const preset = (projectKey && preferences.byProject[projectKey]) || preferences.last || {refs: {}, billable: true};
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

function findOptionByName(session, field, refs, name) {
  const provider = session.provider;
  if (typeof provider.findOption === 'function') {
    return provider.findOption(session, field, refs, name);
  }
  const wanted = name.toLowerCase();
  return provider.listOptions(session, field, refs).find((option) => option.label.toLowerCase() === wanted) || null;
}

function issueEntryForm(ctx, lang) {
  const form = entryForm(ctx.currentUser, lang, ctx.issue.project.key);
  const session = openSession(ctx.currentUser, lang);
  const refs = form.defaults.refs;
  const warnings = [];
  const mapped = {};

  form.fields.forEach((field) => {
    const sourceField = ctx.settings[field.key + 'Field'];
    if (!sourceField) {
      return;
    }
    const value = readFieldValue(ctx.issue, ctx.currentUser, sourceField);
    if (!value) {
      return;
    }
    const parentRefs = {};
    if (field.dependsOn) {
      parentRefs[field.dependsOn] = refs[field.dependsOn] ? refs[field.dependsOn].id : null;
    }
    const option = findOptionByName(session, field.key, parentRefs, value);
    if (!option) {
      warnings.push(i18n.translate(lang, 'mappingNotFound', {
        field: field.label,
        value: value,
        source: sourceField,
        provider: session.provider.name
      }));
      return;
    }
    const changed = !refs[field.key] || refs[field.key].id !== option.id;
    refs[field.key] = option;
    mapped[field.key] = sourceField;
    if (changed) {
      form.fields.forEach((child) => {
        if (child.dependsOn === field.key && !mapped[child.key]) {
          refs[child.key] = null;
        }
      });
    }
  });

  form.mappedFields = mapped;
  form.warnings = warnings;
  return form;
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

function listOptions(user, lang, field, refs) {
  const session = openSession(user, lang);
  const known = session.provider.entryFields.some((entryField) => entryField.key === field);
  if (!known) {
    i18n.fail('unknownField', {field: field});
  }
  return session.provider.listOptions(session, field, refs);
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
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    text: text,
    billable: body.billable === true,
    refs: refs
  };
}

function createEntry(user, lang, body, projectKey) {
  const session = openSession(user, lang);
  const input = validateInput(session.provider, body);
  const entry = session.provider.createEntry(session, input);

  const labels = body.labels || {};
  const remembered = {};
  Object.keys(input.refs).forEach((key) => {
    remembered[key] = input.refs[key]
      ? {id: input.refs[key], label: labels[key] ? String(labels[key]) : input.refs[key]}
      : null;
  });
  rememberSelection(user, projectKey, remembered, input.billable);
  return {entry: entry, provider: session.provider};
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

function listEntries(user, lang, from, to) {
  const session = openSession(user, lang);
  const range = {from: new Date(from), to: new Date(to)};
  if (isNaN(range.from.getTime()) || isNaN(range.to.getTime()) || range.to <= range.from) {
    i18n.fail('invalidRange');
  }
  if (range.to.getTime() - range.from.getTime() > 62 * 24 * 3600 * 1000) {
    i18n.fail('rangeTooLong');
  }
  const entries = session.provider.listEntries(
    session,
    {from: range.from.toISOString(), to: range.to.toISOString()},
    true
  );
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

function listCalendar(user, lang, fromDate, toDate) {
  const session = openSession(user, lang);
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(fromDate || '') || !pattern.test(toDate || '') || toDate < fromDate) {
    i18n.fail('invalidRange');
  }
  if (typeof session.provider.listCalendar !== 'function') {
    return {absences: [], holidays: []};
  }
  return session.provider.listCalendar(session, {fromDate: fromDate, toDate: toDate});
}

exports.parseJson = parseJson;
exports.respond = respond;
exports.requestBody = requestBody;
exports.optionRefs = optionRefs;
exports.readAccount = readAccount;
exports.openSession = openSession;
exports.publicAccount = publicAccount;
exports.accountStatus = accountStatus;
exports.connect = connect;
exports.disconnect = disconnect;
exports.entryForm = entryForm;
exports.issueEntryForm = issueEntryForm;
exports.listOptions = listOptions;
exports.createEntry = createEntry;
exports.listEntries = listEntries;
exports.listCalendar = listCalendar;
