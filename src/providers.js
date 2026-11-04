const http = require('@jetbrains/youtrack-scripting-api/http');
const i18n = require('./i18n');

const MAX_PAGES = 20;
const CLOCKODO = 'clocko:do';

function toClockodoTime(iso) {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    i18n.fail('invalidTimestamp', {value: iso});
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function clockodoError(response) {
  let body = null;
  try {
    body = JSON.parse(response.response);
  } catch {
    body = null;
  }
  if (body && body.error && body.error.message) {
    return i18n.failRaw(body.error.message);
  }
  if (body && Array.isArray(body.errors) && body.errors.length > 0) {
    return i18n.failRaw(body.errors.map((error) => error.message).join('; '));
  }
  if (response.code === 401) {
    return i18n.fail('providerRejectedCredentials', {provider: CLOCKODO});
  }
  if (response.code === 429) {
    return i18n.fail('providerRateLimit', {provider: CLOCKODO});
  }
  return i18n.fail('providerStatus', {provider: CLOCKODO, status: response.code});
}

function clockodoConnection(session) {
  const credentials = session.credentials;
  if (!credentials || !credentials.email || !credentials.apiKey) {
    i18n.fail('credentialsMissing');
  }
  const connection = new http.Connection('https://my.clockodo.com/api');
  connection.addHeader('X-ClockodoApiUser', credentials.email);
  connection.addHeader('X-ClockodoApiKey', credentials.apiKey);
  connection.addHeader('X-Clockodo-External-Application', 'YouTrack;support@jj-ideenschmiede.de');
  connection.addHeader('X-ClockodoEnableIsoUtcDateTimes', '1');
  connection.addHeader('Accept-Language', session.lang === 'de' ? 'de' : 'en');
  connection.addHeader('Accept', 'application/json');
  connection.addHeader('Content-Type', 'application/json');
  return connection;
}

function clockodoRequest(session, method, path, query, payload) {
  const connection = clockodoConnection(session);
  let response;
  if (method === 'GET') {
    response = connection.getSync(path, query || []);
  } else if (method === 'POST') {
    response = connection.postSync(path, query || [], JSON.stringify(payload || {}));
  } else if (method === 'DELETE') {
    response = connection.deleteSync(path, query || []);
  } else {
    i18n.fail('unsupportedMethod', {method: method});
  }
  if (!response.isSuccess) {
    clockodoError(response);
  }
  return JSON.parse(response.response);
}

function clockodoList(session, path, query, itemsKey, itemsPerPage) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageQuery = query.concat([
      {name: 'page', value: String(page)},
      {name: 'items_per_page', value: String(itemsPerPage)}
    ]);
    const body = clockodoRequest(session, 'GET', path, pageQuery);
    const chunk = body[itemsKey] || [];
    Array.prototype.push.apply(items, chunk);
    if (!body.paging || body.paging.current_page >= body.paging.count_pages || chunk.length === 0) {
      break;
    }
  }
  return items;
}

function sortedOptions(session, items) {
  return items
    .map((item) => ({id: String(item.id), label: item.name}))
    .sort((a, b) => a.label.localeCompare(b.label, session.lang));
}

function namedRef(id, name) {
  if (id === null || id === undefined) {
    return null;
  }
  return {id: String(id), name: name || ('#' + id)};
}

function mapClockodoEntry(entry) {
  return {
    id: String(entry.id),
    start: entry.time_since,
    end: entry.time_until || null,
    durationSeconds: entry.duration !== null && entry.duration !== undefined
      ? entry.duration
      : Math.max(0, Math.round((Date.now() - new Date(entry.time_since).getTime()) / 1000)),
    text: entry.text || '',
    billable: entry.billable === -1 || entry.billable === undefined ? null : entry.billable > 0,
    refs: {
      customer: namedRef(entry.customers_id, entry.customers_name),
      project: namedRef(entry.projects_id, entry.projects_name),
      service: namedRef(entry.services_id, entry.services_name)
    }
  };
}

const ABSENCE_TYPES = {
  1: {kind: 'vacation', label: {de: 'Urlaub', en: 'Vacation'}},
  2: {kind: 'vacation', label: {de: 'Sonderurlaub', en: 'Special leave'}},
  3: {kind: 'vacation', label: {de: 'Überstundenabbau', en: 'Overtime reduction'}},
  4: {kind: 'sick', label: {de: 'Krank', en: 'Sick'}},
  5: {kind: 'sick', label: {de: 'Kind krank', en: 'Sick child'}},
  6: {kind: 'other', label: {de: 'Schule / Weiterbildung', en: 'School / training'}},
  7: {kind: 'other', label: {de: 'Mutterschutz', en: 'Maternity protection'}},
  8: {kind: 'remote', label: {de: 'Homeoffice', en: 'Home office'}},
  9: {kind: 'remote', label: {de: 'Außer Haus', en: 'Out of office'}},
  10: {kind: 'vacation', label: {de: 'Sonderurlaub (unbezahlt)', en: 'Special leave (unpaid)'}},
  11: {kind: 'sick', label: {de: 'Krank (unbezahlt)', en: 'Sick (unpaid)'}},
  12: {kind: 'sick', label: {de: 'Kind krank (unbezahlt)', en: 'Sick child (unpaid)'}},
  13: {kind: 'sick', label: {de: 'Quarantäne', en: 'Quarantine'}},
  14: {kind: 'other', label: {de: 'Wehr- / Ersatzdienst', en: 'Military service'}},
  15: {kind: 'sick', label: {de: 'Krank (Krankengeld)', en: 'Sick (sickness benefit)'}}
};
const ABSENCE_REQUESTED = 0;
const ABSENCE_APPROVED = 1;

function yearsBetween(fromDate, toDate) {
  const years = [];
  for (let year = Number(fromDate.slice(0, 4)); year <= Number(toDate.slice(0, 4)); year++) {
    years.push(year);
  }
  return years;
}

function eachDate(fromDate, toDate, callback) {
  const cursor = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  while (cursor.getTime() <= end.getTime()) {
    callback(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function clockodoAbsences(session, range) {
  const body = clockodoRequest(session, 'GET', '/v4/absences', [
    {name: 'filter[users_id]', value: session.account.externalUserId},
    {name: 'filter[year]', value: yearsBetween(range.fromDate, range.toDate).join(',')}
  ]);
  const days = [];
  (body.data || []).forEach((absence) => {
    if (absence.status !== ABSENCE_APPROVED && absence.status !== ABSENCE_REQUESTED) {
      return;
    }
    const type = ABSENCE_TYPES[absence.type] || {kind: 'other', label: {de: 'Abwesend', en: 'Absent'}};
    const from = absence.date_since > range.fromDate ? absence.date_since : range.fromDate;
    const to = absence.date_until < range.toDate ? absence.date_until : range.toDate;
    const halfDay = absence.date_since === absence.date_until && absence.count_days !== null &&
      absence.count_days !== undefined && absence.count_days < 1;
    eachDate(from, to, (date) => {
      days.push({
        date: date,
        kind: type.kind,
        label: i18n.pick(session.lang, type.label),
        requested: absence.status === ABSENCE_REQUESTED,
        halfDay: halfDay,
        hours: absence.type === 3 ? absence.count_hours : null
      });
    });
  });
  return days;
}

function clockodoHolidays(session, range) {
  const days = [];
  yearsBetween(range.fromDate, range.toDate).forEach((year) => {
    const body = clockodoRequest(session, 'GET', '/v2/usersNonbusinessDays', [
      {name: 'year', value: String(year)},
      {name: 'filter[users_id]', value: session.account.externalUserId},
      {name: 'items_per_page', value: '100'}
    ]);
    (body.data || []).forEach((row) => {
      (row.days || []).forEach((day) => {
        if (day.evaluated_date >= range.fromDate && day.evaluated_date <= range.toDate) {
          days.push({date: day.evaluated_date, name: day.name, halfDay: day.half_day === true});
        }
      });
    });
  });
  return days;
}

const clockodo = {
  id: 'clockodo',
  name: CLOCKODO,
  description: {
    de: 'Zeiterfassung mit clocko:do (my.clockodo.com).',
    en: 'Time tracking with clocko:do (my.clockodo.com).'
  },
  credentialFields: [
    {
      key: 'email',
      label: {de: 'E-Mail-Adresse', en: 'Email address'},
      type: 'email',
      placeholder: {de: 'name@firma.de', en: 'name@company.com'}
    },
    {
      key: 'apiKey',
      label: {de: 'API-Schlüssel', en: 'API key'},
      type: 'secret'
    }
  ],
  credentialHelp: {
    de: 'Den persönlichen API-Schlüssel findest du in clocko:do in deinen persönlichen Einstellungen.',
    en: 'You can find your personal API key in clocko:do in your personal settings.'
  },
  credentialHelpUrl: null,
  entryFields: [
    {key: 'customer', label: {de: 'Kunde', en: 'Customer'}, required: true, dependsOn: null},
    {key: 'project', label: {de: 'Projekt', en: 'Project'}, required: false, dependsOn: 'customer'},
    {key: 'service', label: {de: 'Leistung', en: 'Service'}, required: true, dependsOn: null}
  ],
  supportsBillable: true,
  links: [
    {label: {de: 'clocko:do öffnen', en: 'Open clocko:do'}, url: 'https://my.clockodo.com/'}
  ],

  verify: (session) => {
    const body = clockodoRequest(session, 'GET', '/v4/users/me');
    const user = body.data;
    if (!user || !user.id) {
      i18n.fail('providerNoProfile', {provider: CLOCKODO});
    }
    if (user.active === false) {
      i18n.fail('providerUserInactive', {provider: CLOCKODO});
    }
    return {
      externalUserId: String(user.id),
      name: user.name,
      email: user.email || session.credentials.email,
      company: null
    };
  },

  listOptions: (session, field, refs) => {
    if (field === 'customer') {
      return sortedOptions(session,
        clockodoList(session, '/v3/customers', [{name: 'filter[active]', value: 'true'}], 'data', 1000));
    }
    if (field === 'project') {
      if (!refs.customer) {
        return [];
      }
      return sortedOptions(session, clockodoList(session, '/v4/projects', [
        {name: 'filter[customers_id]', value: String(refs.customer)},
        {name: 'filter[active]', value: 'true'},
        {name: 'filter[completed]', value: 'false'}
      ], 'data', 1000));
    }
    if (field === 'service') {
      return sortedOptions(session,
        clockodoList(session, '/v4/services', [{name: 'filter[active]', value: 'true'}], 'data', 1000));
    }
    return i18n.fail('unknownField', {field: field});
  },

  findOption: (session, field, refs, name) => {
    const paths = {customer: '/v3/customers', project: '/v4/projects', service: '/v4/services'};
    if (!paths[field] || (field === 'project' && !refs.customer)) {
      return null;
    }
    const query = [
      {name: 'filter[fulltext]', value: name},
      {name: 'filter[active]', value: 'true'}
    ];
    if (field === 'project') {
      query.push({name: 'filter[customers_id]', value: String(refs.customer)});
    }
    const wanted = name.trim().toLowerCase();
    const match = clockodoList(session, paths[field], query, 'data', 100)
      .find((item) => String(item.name).trim().toLowerCase() === wanted);
    return match ? {id: String(match.id), label: match.name} : null;
  },

  listEntries: (session, range, withNames, allUsers) => {
    const query = [
      {name: 'time_since', value: toClockodoTime(range.from)},
      {name: 'time_until', value: toClockodoTime(range.to)}
    ];
    if (!allUsers) {
      query.push({name: 'filter[users_id]', value: session.account.externalUserId});
    }
    if (withNames) {
      query.push({name: 'enhanced_list', value: 'true'});
    }
    return clockodoList(session, '/v2/entries', query, 'entries', 1000)
      .filter((entry) => !entry.type || entry.type === 1)
      .map(mapClockodoEntry);
  },

  listCalendar: (session, range) => {
    let absences = [];
    let holidays = [];
    try {
      absences = clockodoAbsences(session, range);
    } catch (e) {
      console.warn('external-time-tracking: absences unavailable: ' + (e.message || e));
    }
    try {
      holidays = clockodoHolidays(session, range);
    } catch (e) {
      console.warn('external-time-tracking: holidays unavailable: ' + (e.message || e));
    }
    return {absences: absences, holidays: holidays};
  },

  createEntry: (session, input) => {
    const payload = {
      customers_id: Number(input.refs.customer),
      services_id: Number(input.refs.service),
      billable: input.billable ? 1 : 0,
      time_since: toClockodoTime(input.start),
      time_until: toClockodoTime(input.end),
      text: input.text
    };
    if (input.refs.project) {
      payload.projects_id = Number(input.refs.project);
    }
    const body = clockodoRequest(session, 'POST', '/v2/entries', [], payload);
    return mapClockodoEntry(body.entry);
  }
};

const PROVIDERS = [clockodo];

function localizeFields(lang, fields) {
  return fields.map((field) => Object.assign({}, field, {
    label: i18n.pick(lang, field.label),
    placeholder: i18n.pick(lang, field.placeholder)
  }));
}

exports.all = () => PROVIDERS;

exports.find = (id) => PROVIDERS.find((provider) => provider.id === id) || null;

exports.describe = (provider, lang) => ({
  id: provider.id,
  name: provider.name,
  description: i18n.pick(lang, provider.description),
  credentialFields: localizeFields(lang, provider.credentialFields),
  credentialHelp: i18n.pick(lang, provider.credentialHelp),
  credentialHelpUrl: provider.credentialHelpUrl
});

exports.entryFields = (provider, lang) => localizeFields(lang, provider.entryFields);

exports.links = (provider, lang) => provider.links.map((link) => ({
  label: i18n.pick(lang, link.label),
  url: link.url
}));
