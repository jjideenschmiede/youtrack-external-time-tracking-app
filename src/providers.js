const http = require('@jetbrains/youtrack-scripting-api/http');
const i18n = require('./i18n');

const CLOCKODO = 'Clockodo';
const BASE_URL = 'https://my.clockodo.com/api';

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

function clockodoConnection(credentials, lang) {
  if (!credentials || !credentials.email || !credentials.apiKey) {
    i18n.fail('credentialsMissing');
  }
  const connection = new http.Connection(BASE_URL);
  connection.addHeader('X-ClockodoApiUser', credentials.email);
  connection.addHeader('X-ClockodoApiKey', credentials.apiKey);
  connection.addHeader('X-Clockodo-External-Application', 'YouTrack;support@jj-ideenschmiede.de');
  connection.addHeader('X-ClockodoEnableIsoUtcDateTimes', '1');
  connection.addHeader('Accept-Language', lang === 'de' ? 'de' : 'en');
  connection.addHeader('Accept', 'application/json');
  connection.addHeader('Content-Type', 'application/json');
  return connection;
}

const OPTION_KEYS = ['id', 'name'];
const ENTRY_KEYS = [
  'id', 'type', 'time_since', 'time_until', 'duration', 'text', 'billable',
  'customers_id', 'customers_name', 'projects_id', 'projects_name', 'services_id', 'services_name'
];

function listRequest(path, query, itemsKey, itemsPerPage, keep) {
  return {method: 'GET', path: path, query: query, list: itemsKey, perPage: itemsPerPage, page: 1, keep: keep};
}

function pageQuery(request) {
  if (!request.list) {
    return request.query || [];
  }
  return (request.query || []).concat([
    {name: 'page', value: String(request.page)},
    {name: 'items_per_page', value: String(request.perPage)}
  ]);
}

function nextPage(request, body) {
  if (!request.list || !body.paging || body.paging.current_page >= body.paging.count_pages ||
    !(body[request.list] || []).length) {
    return null;
  }
  return Object.assign({}, request, {page: request.page + 1});
}

function sortedOptions(lang, items) {
  return items
    .map((item) => ({id: String(item.id), label: item.name}))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
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
const ABSENCE_APPROVAL_CANCELLED = 3;
const ABSENCE_CANCELLED = 4;
const ABSENCE_OFFERED = [1, 4, 5];

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

const OPTION_PATHS = {customer: '/v3/customers', project: '/v4/projects', service: '/v4/services'};

const clockodo = {
  id: 'clockodo',
  name: CLOCKODO,
  description: {
    de: 'Zeiterfassung mit Clockodo (my.clockodo.com).',
    en: 'Time tracking with Clockodo (my.clockodo.com).'
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
    de: 'Den persönlichen API-Schlüssel findest du in Clockodo in deinen persönlichen Einstellungen.',
    en: 'You can find your personal API key in Clockodo in your personal settings.'
  },
  credentialHelpUrl: null,
  entryFields: [
    {key: 'customer', label: {de: 'Kunde', en: 'Customer'}, required: true, dependsOn: null},
    {key: 'project', label: {de: 'Projekt', en: 'Project'}, required: false, dependsOn: 'customer'},
    {key: 'service', label: {de: 'Leistung', en: 'Service'}, required: true, dependsOn: null}
  ],
  supportsBillable: true,
  links: [
    {label: {de: 'Clockodo öffnen', en: 'Open Clockodo'}, url: 'https://my.clockodo.com/'}
  ],

  connection: clockodoConnection,
  fail: clockodoError,
  pageQuery: pageQuery,
  nextPage: nextPage,

  verifyRequest: () => ({method: 'GET', path: '/v4/users/me'}),

  parseVerify: (body, credentials) => {
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
      email: user.email || credentials.email,
      company: null,
      lock: {
        known: 'edit_lock' in user || 'edit_lock_dyn' in user,
        unrestricted: user.role === 'owner' || user.role === 'manager',
        date: user.edit_lock || null,
        days: typeof user.edit_lock_dyn === 'number' && user.edit_lock_dyn > 0 ? user.edit_lock_dyn : null,
        checkedAt: Date.now()
      }
    };
  },

  optionsRequest: (field, refs) => {
    if (field === 'customer' || field === 'service') {
      return listRequest(OPTION_PATHS[field], [{name: 'filter[active]', value: 'true'}], 'data', 1000, OPTION_KEYS);
    }
    if (field === 'project') {
      if (!refs.customer) {
        return null;
      }
      return listRequest(OPTION_PATHS.project, [
        {name: 'filter[customers_id]', value: String(refs.customer)},
        {name: 'filter[active]', value: 'true'},
        {name: 'filter[completed]', value: 'false'}
      ], 'data', 1000, OPTION_KEYS);
    }
    return i18n.fail('unknownField', {field: field});
  },

  parseOptions: (lang, items) => sortedOptions(lang, items),

  findRequest: (field, refs, name) => {
    if (!OPTION_PATHS[field] || (field === 'project' && !refs.customer)) {
      return null;
    }
    const query = [
      {name: 'filter[fulltext]', value: name},
      {name: 'filter[active]', value: 'true'}
    ];
    if (field === 'project') {
      query.push({name: 'filter[customers_id]', value: String(refs.customer)});
    }
    return listRequest(OPTION_PATHS[field], query, 'data', 100, OPTION_KEYS);
  },

  matchOption: (items, name) => {
    const wanted = name.trim().toLowerCase();
    const match = items.find((item) => String(item.name).trim().toLowerCase() === wanted);
    return match ? {id: String(match.id), label: match.name} : null;
  },

  entriesRequest: (account, range, withNames, allUsers) => {
    const query = [
      {name: 'time_since', value: toClockodoTime(range.from)},
      {name: 'time_until', value: toClockodoTime(range.to)}
    ];
    if (!allUsers) {
      query.push({name: 'filter[users_id]', value: account.externalUserId});
    }
    if (withNames) {
      query.push({name: 'enhanced_list', value: 'true'});
    }
    return listRequest('/v2/entries', query, 'entries', 1000, ENTRY_KEYS);
  },

  parseEntries: (items) => items
    .filter((entry) => !entry.type || entry.type === 1)
    .map(mapClockodoEntry),

  calendarRequests: (account, range) => {
    const requests = [{
      method: 'GET',
      path: '/v4/absences',
      query: [
        {name: 'filter[users_id]', value: account.externalUserId},
        {name: 'filter[year]', value: yearsBetween(range.fromDate, range.toDate).join(',')}
      ],
      optional: true,
      key: 'absences'
    }];
    yearsBetween(range.fromDate, range.toDate).forEach((year) => {
      requests.push({
        method: 'GET',
        path: '/v2/usersNonbusinessDays',
        query: [
          {name: 'year', value: String(year)},
          {name: 'filter[users_id]', value: account.externalUserId},
          {name: 'items_per_page', value: '100'}
        ],
        optional: true,
        key: 'holidays'
      });
    });
    return requests;
  },

  parseCalendar: (lang, range, results) => {
    const absences = [];
    const holidays = [];
    results.forEach((result) => {
      if (!result.body) {
        return;
      }
      if (result.key === 'absences') {
        (result.body.data || []).forEach((absence) => {
          if (absence.status !== ABSENCE_APPROVED && absence.status !== ABSENCE_REQUESTED) {
            return;
          }
          const type = ABSENCE_TYPES[absence.type] || {kind: 'other', label: {de: 'Abwesend', en: 'Absent'}};
          const from = absence.date_since > range.fromDate ? absence.date_since : range.fromDate;
          const to = absence.date_until < range.toDate ? absence.date_until : range.toDate;
          const halfDay = absence.date_since === absence.date_until && absence.count_days !== null &&
            absence.count_days !== undefined && absence.count_days < 1;
          eachDate(from, to, (date) => {
            absences.push({
              id: String(absence.id),
              date: date,
              from: absence.date_since,
              to: absence.date_until,
              kind: type.kind,
              label: i18n.pick(lang, type.label),
              requested: absence.status === ABSENCE_REQUESTED,
              halfDay: halfDay,
              hours: absence.type === 3 ? absence.count_hours : null
            });
          });
        });
        return;
      }
      (result.body.data || []).forEach((row) => {
        (row.days || []).forEach((day) => {
          if (day.evaluated_date >= range.fromDate && day.evaluated_date <= range.toDate) {
            holidays.push({date: day.evaluated_date, name: day.name, halfDay: day.half_day === true});
          }
        });
      });
    });
    return {absences: absences, holidays: holidays};
  },

  absenceTypes: (lang) => ABSENCE_OFFERED.map((id) => ({
    id: String(id),
    kind: ABSENCE_TYPES[id].kind,
    label: i18n.pick(lang, ABSENCE_TYPES[id].label)
  })),

  createAbsenceRequest: (account, input) => {
    const payload = {
      users_id: Number(account.externalUserId),
      type: Number(input.type),
      date_since: input.fromDate,
      date_until: input.toDate
    };
    if (input.halfDay) {
      payload.half_day = true;
    }
    if (input.note) {
      payload.note = input.note;
    }
    return {method: 'POST', path: '/v4/absences', query: [], payload: payload};
  },

  cancelAbsenceRequest: (id, requested) => ({
    method: 'PUT',
    path: '/v4/absences/' + encodeURIComponent(String(id)),
    query: [],
    payload: {status: requested ? ABSENCE_CANCELLED : ABSENCE_APPROVAL_CANCELLED}
  }),

  balanceRequest: (account, year) => ({
    method: 'GET',
    path: '/userreports/' + encodeURIComponent(String(account.externalUserId)),
    query: [{name: 'year', value: String(year)}, {name: 'type', value: '0'}],
    optional: true
  }),

  parseBalance: (body) => {
    const report = body && body.userreport;
    if (!report || typeof report.holidays_quota !== 'number') {
      return null;
    }
    const total = report.holidays_quota + (report.holidays_carry || 0) -
      (report.holidays_forfeited || 0) - (report.holidays_paid_out || 0);
    const used = report.sum_absence && typeof report.sum_absence.regular_holidays === 'number'
      ? report.sum_absence.regular_holidays
      : 0;
    return {total: total, remaining: total - used};
  },

  parseAbsence: (body) => {
    const absence = (body && (body.data || body.absence)) || {};
    return {requested: absence.status === ABSENCE_REQUESTED};
  },

  createRequest: (input) => {
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
    return {method: 'POST', path: '/v2/entries', query: [], payload: payload};
  },

  parseCreate: (body) => mapClockodoEntry(body.entry),

  updateRequest: (id, input) => {
    const request = clockodo.createRequest(input);
    request.method = 'PUT';
    request.path = '/v2/entries/' + encodeURIComponent(String(id));
    if (!input.refs.project) {
      request.payload.projects_id = null;
    }
    return request;
  },

  parseUpdate: (body) => mapClockodoEntry(body.entry),

  clockRequest: () => ({method: 'GET', path: '/v2/clock', query: []}),

  startClockRequest: (input) => {
    const payload = {
      customers_id: Number(input.refs.customer),
      services_id: Number(input.refs.service),
      billable: input.billable ? 1 : 0,
      text: input.text
    };
    if (input.refs.project) {
      payload.projects_id = Number(input.refs.project);
    }
    return {method: 'POST', path: '/v2/clock', query: [], payload: payload};
  },

  stopClockRequest: (id) => ({method: 'DELETE', path: '/v2/clock/' + encodeURIComponent(String(id)), query: []}),

  parseClock: (body) => ({
    running: body && body.running ? mapClockodoEntry(body.running) : null,
    stopped: body && body.stopped ? mapClockodoEntry(body.stopped) : null
  })
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
