const entities = require('@jetbrains/youtrack-scripting-api/entities');
const common = require('./common');
const providers = require('./providers');
const i18n = require('./i18n');

const HANDLER = 'onClockChecked';
const HOUR = 3600 * 1000;
const NO_ISSUES = 'created: 1970-01-01';
const RENEWED_HANDLER = 'onTokenRenewed';
const REJECTED = [401, 403];
const RENEWAL_REJECTED = [400, 401];
const RENEWAL_MARGIN = 60 * 1000;

function reminderHours(settings) {
  const hours = parseInt(settings && settings.clockReminder, 10);
  return hours > 0 ? hours : 0;
}

function waitingUsers() {
  const users = [];
  entities.User.findByExtensionProperties({timeTrackingClockReminder: true}).forEach((user) => {
    users.push(user);
  });
  return users;
}

function clockIssue(clock) {
  try {
    return clock && clock.issueId ? entities.Issue.findById(clock.issueId) : null;
  } catch {
    return null;
  }
}

function issueQuery() {
  const ids = [];
  waitingUsers().forEach((user) => {
    const issue = clockIssue(common.readClock(user));
    if (issue && ids.indexOf(issue.id) === -1) {
      ids.push(issue.id);
    }
  });
  return ids.length > 0 ? 'issue id: ' + ids.join(', ') : NO_ISSUES;
}

function dueUser(issue, hours) {
  const now = Date.now();
  return waitingUsers().find((user) => {
    const clock = common.readClock(user);
    const current = clockIssue(clock);
    return current && current.id === issue.id && now - new Date(clock.start).getTime() >= hours * HOUR;
  }) || null;
}

function markReminded(user, clock) {
  common.writeClock(user, Object.assign({}, clock, {reminded: true}));
}

function formatRunning(start) {
  const minutes = Math.floor((Date.now() - new Date(start).getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return rest + 'm';
  }
  return rest === 0 ? hours + 'h' : hours + 'h ' + rest + 'm';
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendReminder(user, issue, clock) {
  const lang = i18n.userLanguage(user);
  const params = {
    duration: formatRunning(clock.start),
    issue: issue.id,
    summary: escapeHtml(issue.summary),
    url: issue.url
  };
  user.notify(
    i18n.translate(lang, 'clockReminderSubject', params),
    i18n.translate(lang, 'clockReminderBody', params),
    true
  );
}

function checkClock(ctx, user, clock, provider, credentials) {
  const request = provider.clockRequest();
  ctx.store('login', user.login);
  ctx.store('clockId', String(clock.id));
  provider.connection(credentials, i18n.userLanguage(user)).getAsync(request.path, provider.pageQuery(request), HANDLER);
}

function renewToken(ctx, user, clock, provider, credentials) {
  const request = provider.oauth.refreshRequest(credentials);
  ctx.store('login', user.login);
  ctx.store('clockId', String(clock.id));
  provider.connection(credentials, i18n.userLanguage(user), request)
    .postAsync(request.path, [], common.requestPayload(request), RENEWED_HANDLER);
}

function needsRenewal(provider, credentials) {
  return !!provider.oauth && !!credentials.refreshToken && credentials.expiresAt - RENEWAL_MARGIN <= Date.now();
}

exports.rule = entities.Issue.onSchedule({
  title: 'Remind users of long-running clocks',
  cron: '0 0/15 * * * ?',
  search: issueQuery,
  muteUpdateNotifications: true,
  modifyUpdatedProperties: false,
  guard: (ctx) => reminderHours(ctx.settings) > 0,
  action: (ctx) => {
    const user = dueUser(ctx.issue, reminderHours(ctx.settings));
    if (!user) {
      return;
    }
    const clock = common.readClock(user);
    const provider = providers.find(clock.provider);
    const credentials = common.parseJson(user.extensionProperties.timeTrackingCredentials, null);
    if (!provider || !credentials) {
      markReminded(user, clock);
      return;
    }
    if (needsRenewal(provider, credentials)) {
      renewToken(ctx, user, clock, provider, credentials);
    } else {
      checkClock(ctx, user, clock, provider, credentials);
    }
  },
  asyncFunctions: {
    onTokenRenewed: (ctx) => {
      const user = entities.User.findByLogin(ctx.load('login'));
      const clock = user ? common.readClock(user) : null;
      if (!clock || String(clock.id) !== ctx.load('clockId') || clock.reminded) {
        return;
      }
      const provider = providers.find(clock.provider);
      const credentials = common.parseJson(user.extensionProperties.timeTrackingCredentials, null);
      const response = ctx.response;
      if (!provider || !credentials) {
        markReminded(user, clock);
        return;
      }
      if (!response || !response.isSuccess) {
        if (response && RENEWAL_REJECTED.indexOf(response.code) !== -1 && needsRenewal(provider, credentials)) {
          markReminded(user, clock);
        }
        return;
      }
      const renewed = provider.oauth.parseToken(JSON.parse(response.response || '{}'), credentials.clientId, credentials);
      user.extensionProperties.timeTrackingCredentials = JSON.stringify(renewed);
      checkClock(ctx, user, clock, provider, renewed);
    },
    onClockChecked: (ctx) => {
      const user = entities.User.findByLogin(ctx.load('login'));
      const clock = user ? common.readClock(user) : null;
      if (!clock || String(clock.id) !== ctx.load('clockId') || clock.reminded) {
        return;
      }
      const response = ctx.response;
      if (!response || !response.isSuccess) {
        if (response && REJECTED.indexOf(response.code) !== -1) {
          markReminded(user, clock);
        }
        return;
      }
      const running = providers.find(clock.provider).parseClock(JSON.parse(response.response || '{}')).running;
      if (!running || String(running.id) !== String(clock.id)) {
        common.writeClock(user, null);
        return;
      }
      const issue = clockIssue(clock);
      if (issue) {
        sendReminder(user, issue, clock);
      }
      markReminded(user, clock);
    }
  },
  requirements: {}
});
