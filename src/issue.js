const common = require('./common');

const REFRESH_WINDOW_DAYS = 60;
const DAY = 24 * 3600 * 1000;


function writeEntries(issue, entries) {
  issue.extensionProperties.timeTrackingEntries = entries.length > 0 ? JSON.stringify(entries) : null;
  markLogged(issue, entries);
}

function markLogged(issue, entries) {
  if (entries.length > 0) {
    common.indexIssue(issue);
  }
}

function refKey(refs) {
  return ['customer', 'project', 'service']
    .map((key) => (refs && refs[key] ? refs[key].id : ''))
    .join('|');
}

function refreshOwnEntries(issue, user, lang, entries) {
  const connection = common.readAccount(user);
  if (!connection) {
    return entries;
  }
  const oldest = Date.now() - REFRESH_WINDOW_DAYS * DAY;
  const own = entries.filter((entry) => entry.userLogin === user.login &&
    entry.provider === connection.provider.id &&
    new Date(entry.start).getTime() >= oldest);
  if (own.length === 0) {
    return entries;
  }

  const starts = own.map((entry) => new Date(entry.start).getTime());
  const range = {
    from: new Date(Math.min.apply(null, starts) - DAY).toISOString(),
    to: new Date(Math.max.apply(null, starts) + 2 * DAY).toISOString()
  };

  let remote;
  try {
    const session = common.openSession(user, lang);
    remote = session.provider.listEntries(session, range, true);
  } catch (e) {
    console.warn('external-time-tracking: refresh skipped for ' + issue.id + ': ' + e.message);
    return entries;
  }

  const remoteById = {};
  remote.forEach((entry) => {
    remoteById[entry.id] = entry;
  });

  let changed = false;
  const next = [];
  entries.forEach((entry) => {
    if (own.indexOf(entry) === -1) {
      next.push(entry);
      return;
    }
    const current = remoteById[entry.id];
    if (!current) {
      if (!entry.deleted) {
        changed = true;
        next.push(Object.assign({}, entry, {deleted: true, deletedAt: Date.now()}));
        return;
      }
      next.push(entry);
      return;
    }
    if (entry.deleted || current.durationSeconds !== entry.durationSeconds ||
      current.start !== entry.start || current.text !== entry.text ||
      refKey(current.refs) !== refKey(entry.refs)) {
      changed = true;
      next.push(Object.assign({}, entry, {
        start: current.start,
        durationSeconds: current.durationSeconds,
        text: current.text,
        refs: current.refs,
        deleted: false,
        deletedAt: null
      }));
      return;
    }
    next.push(entry);
  });

  if (changed) {
    writeEntries(issue, next);
  }
  return next;
}

function summary(user, lang, entries) {
  let total = 0;
  let mine = 0;
  const visible = entries
    .map((entry) => {
      const isMine = entry.userLogin === user.login;
      if (!entry.deleted) {
        total += entry.durationSeconds;
        if (isMine) {
          mine += entry.durationSeconds;
        }
      }
      return Object.assign({}, entry, {mine: isMine, deleted: entry.deleted === true});
    })
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

  return {
    account: common.publicAccount(user, lang),
    totalSeconds: total,
    mySeconds: mine,
    entries: visible
  };
}

exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      method: 'POST',
      path: 'summary',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const entries = refreshOwnEntries(ctx.issue, ctx.currentUser, lang, common.readIssueEntries(ctx.issue));
          markLogged(ctx.issue, entries);
          return summary(ctx.currentUser, lang, entries);
        });
      }
    },
    {
      scope: 'issue',
      method: 'GET',
      path: 'form',
      handle: (ctx) => {
        common.respond(ctx, (lang) => common.issueEntryForm(ctx, lang));
      }
    },
    {
      scope: 'issue',
      method: 'POST',
      path: 'entries',
      handle: (ctx) => {
        common.respond(ctx, (lang) => {
          const body = common.requestBody(ctx);
          const created = common.createEntry(ctx.currentUser, lang, body, ctx.issue.project.key);
          const entries = common.readIssueEntries(ctx.issue);
          entries.push({
            id: created.entry.id,
            provider: created.provider.id,
            start: created.entry.start,
            durationSeconds: created.entry.durationSeconds,
            text: created.entry.text,
            refs: created.refs,
            userLogin: ctx.currentUser.login,
            userName: ctx.currentUser.visibleName
          });
          writeEntries(ctx.issue, entries);
          return summary(ctx.currentUser, lang, entries);
        });
      }
    }
  ]
};
