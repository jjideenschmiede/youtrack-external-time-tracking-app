const DEFAULT_LANGUAGE = 'en';
const SUPPORTED = ['de', 'en'];

const MESSAGES = {
  de: {
    unknownError: 'Unbekannter Fehler.',
    invalidBody: 'Ungültiger Request-Body.',
    entryNotEditable: 'Dieser Eintrag kann hier nicht bearbeitet werden.',
    clockNotRunning: 'Es läuft keine Stoppuhr.',
    clockReminderSubject: 'Stoppuhr läuft noch auf {issue} ({duration})',
    clockReminderBody: 'Deine Stoppuhr auf <a href="{url}">{issue} {summary}</a> läuft seit {duration}.<br><br>Falls du vergessen hast, sie zu stoppen, öffne das Ticket und stoppe die Stoppuhr im Time-Tracking-Panel.',
    issueNotFound: 'Das Ticket „{issue}“ wurde nicht gefunden.',
    optionNotFound: '{field} „{value}“ wurde in {provider} nicht gefunden.',
    permissionDenied: 'Dafür fehlt dir die Berechtigung.',
    durationInvalid: 'Die Dauer „{value}“ ist ungültig. Beispiele: 1h 30m, 1.5h, 90m.',
    jobNotFound: 'Die Anfrage ist abgelaufen. Bitte versuche es erneut.',
    guestNotAllowed: 'Gäste können kein Zeiterfassungskonto verbinden. Bitte melde dich an.',
    notConnected: 'Kein Zeiterfassungskonto verbunden. Bitte zuerst im Profil unter „Time Tracking“ verbinden.',
    credentialsMissing: 'Die Zugangsdaten fehlen. Bitte das Konto im Profil erneut verbinden.',
    unknownProvider: 'Unbekannter Anbieter: {provider}',
    fieldMissing: '{field} fehlt.',
    fieldRequired: '{field} ist erforderlich.',
    unknownField: 'Unbekanntes Feld: {field}',
    invalidTimes: 'Beginn und Ende müssen gültige Zeitpunkte sein.',
    endBeforeStart: 'Das Ende muss nach dem Beginn liegen.',
    entryTooLong: 'Ein Zeiteintrag darf höchstens 24 Stunden lang sein.',
    textRequired: 'Bitte eine Beschreibung angeben.',
    invalidRange: 'Ungültiger Zeitraum.',
    rangeTooLong: 'Der Zeitraum darf höchstens zwei Monate umfassen.',
    reportRangeTooLong: 'Der Zeitraum darf höchstens ein Jahr umfassen.',
    invalidTimestamp: 'Ungültiger Zeitpunkt: {value}',
    providerRejectedCredentials: '{provider} hat die Zugangsdaten abgelehnt. Bitte E-Mail-Adresse und API-Schlüssel prüfen.',
    providerRateLimit: '{provider}-Ratenlimit erreicht. Bitte in einer Minute erneut versuchen.',
    providerStatus: '{provider} antwortete mit Status {status}.',
    providerNoProfile: '{provider} hat kein Benutzerprofil geliefert.',
    providerUserInactive: 'Der {provider}-Benutzer ist deaktiviert.',
    mappingNotFound: '{field} „{value}“ aus dem Ticketfeld „{source}“ wurde in {provider} nicht gefunden.'
  },
  en: {
    unknownError: 'Unknown error.',
    invalidBody: 'Invalid request body.',
    entryNotEditable: 'This entry cannot be edited here.',
    clockNotRunning: 'No clock is running.',
    clockReminderSubject: 'Clock still running on {issue} ({duration})',
    clockReminderBody: 'Your clock on <a href="{url}">{issue} {summary}</a> has been running for {duration}.<br><br>If you forgot to stop it, open the issue and stop the clock in the Time Tracking panel.',
    issueNotFound: 'The issue “{issue}” was not found.',
    optionNotFound: '{field} “{value}” was not found in {provider}.',
    permissionDenied: 'You do not have the permission to do this.',
    durationInvalid: 'The duration “{value}” is invalid. Examples: 1h 30m, 1.5h, 90m.',
    jobNotFound: 'The request has expired. Please try again.',
    guestNotAllowed: 'Guests cannot connect a time tracking account. Please log in.',
    notConnected: 'No time tracking account connected. Connect one in your profile under “Time Tracking” first.',
    credentialsMissing: 'The credentials are missing. Please reconnect the account in your profile.',
    unknownProvider: 'Unknown provider: {provider}',
    fieldMissing: '{field} is missing.',
    fieldRequired: '{field} is required.',
    unknownField: 'Unknown field: {field}',
    invalidTimes: 'Start and end must be valid points in time.',
    endBeforeStart: 'The end must be after the start.',
    entryTooLong: 'A time entry can be at most 24 hours long.',
    textRequired: 'Please enter a description.',
    invalidRange: 'Invalid time range.',
    rangeTooLong: 'The time range can span at most two months.',
    reportRangeTooLong: 'The time range can span at most one year.',
    invalidTimestamp: 'Invalid point in time: {value}',
    providerRejectedCredentials: '{provider} rejected the credentials. Please check the email address and API key.',
    providerRateLimit: '{provider} rate limit reached. Please try again in a minute.',
    providerStatus: '{provider} responded with status {status}.',
    providerNoProfile: '{provider} did not return a user profile.',
    providerUserInactive: 'The {provider} user is deactivated.',
    mappingNotFound: '{field} “{value}” from the issue field “{source}” was not found in {provider}.'
  }
};

function normalize(value) {
  const lower = String(value || '').toLowerCase();
  if (lower.indexOf('de') === 0 || lower.indexOf('deutsch') !== -1 || lower.indexOf('german') !== -1) {
    return 'de';
  }
  if (lower.indexOf('en') === 0 || lower.indexOf('english') !== -1) {
    return 'en';
  }
  return null;
}

function userLanguage(user) {
  return normalize(user && user.language) || DEFAULT_LANGUAGE;
}

function language(ctx) {
  const requested = normalize(ctx.request.getParameter('lang'));
  if (requested) {
    return requested;
  }
  return normalize(ctx.currentUser.language) || DEFAULT_LANGUAGE;
}

function pick(lang, value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  return value[lang] || value[DEFAULT_LANGUAGE] || '';
}

function translate(lang, key, params) {
  const dictionary = MESSAGES[SUPPORTED.indexOf(lang) !== -1 ? lang : DEFAULT_LANGUAGE];
  const template = dictionary[key] || MESSAGES[DEFAULT_LANGUAGE][key] || key;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (!params || params[name] === undefined || params[name] === null) {
      return match;
    }
    return String(pick(lang, params[name]));
  });
}

function fail(key, params) {
  const error = new Error(key);
  error.i18nKey = key;
  error.i18nParams = params || {};
  throw error;
}

function failRaw(message) {
  throw new Error(message);
}

function errorMessage(lang, error) {
  if (error && error.i18nKey) {
    return translate(lang, error.i18nKey, error.i18nParams);
  }
  if (error && error.message) {
    return error.message;
  }
  const text = error === null || error === undefined ? '' : String(error);
  return text && text !== '[object Object]' ? text : translate(lang, 'unknownError');
}

exports.language = language;
exports.userLanguage = userLanguage;
exports.pick = pick;
exports.translate = translate;
exports.fail = fail;
exports.failRaw = failRaw;
exports.errorMessage = errorMessage;
