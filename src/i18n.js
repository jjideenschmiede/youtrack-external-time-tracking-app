const DEFAULT_LANGUAGE = 'en';
const SUPPORTED = ['de', 'en'];

const MESSAGES = {
  de: {
    unknownError: 'Unbekannter Fehler.',
    invalidBody: 'Ungültiger Request-Body.',
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
    invalidTimestamp: 'Ungültiger Zeitpunkt: {value}',
    providerRejectedCredentials: '{provider} hat die Zugangsdaten abgelehnt. Bitte E-Mail-Adresse und API-Schlüssel prüfen.',
    providerRateLimit: '{provider}-Ratenlimit erreicht. Bitte in einer Minute erneut versuchen.',
    providerStatus: '{provider} antwortete mit Status {status}.',
    providerNoProfile: '{provider} hat kein Benutzerprofil geliefert.',
    providerUserInactive: 'Der {provider}-Benutzer ist deaktiviert.',
    unsupportedMethod: 'Nicht unterstützte Methode: {method}',
    mappingNotFound: '{field} „{value}“ aus dem Ticketfeld „{source}“ wurde in {provider} nicht gefunden.'
  },
  en: {
    unknownError: 'Unknown error.',
    invalidBody: 'Invalid request body.',
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
    invalidTimestamp: 'Invalid point in time: {value}',
    providerRejectedCredentials: '{provider} rejected the credentials. Please check the email address and API key.',
    providerRateLimit: '{provider} rate limit reached. Please try again in a minute.',
    providerStatus: '{provider} responded with status {status}.',
    providerNoProfile: '{provider} did not return a user profile.',
    providerUserInactive: 'The {provider} user is deactivated.',
    unsupportedMethod: 'Unsupported method: {method}',
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
exports.pick = pick;
exports.translate = translate;
exports.fail = fail;
exports.failRaw = failRaw;
exports.errorMessage = errorMessage;
