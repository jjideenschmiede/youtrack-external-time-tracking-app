import type {OAuthAuthorization} from './types';

export const OAUTH_MESSAGE_SOURCE = 'external-time-tracking-oauth';

export interface OAuthChallenge {
  verifier: string;
  challenge: string;
  state: string;
}

export interface OAuthCallback {
  code: string | null;
  error: string | null;
}

const CALLBACK_PATH = '../oauth-callback/index.html';
const TOKEN_BYTES = 32;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function isOAuthAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export function callbackUrl(): string {
  return new URL(CALLBACK_PATH, document.baseURI).href;
}

export async function createChallenge(): Promise<OAuthChallenge> {
  const verifier = randomToken();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return {verifier, challenge: base64Url(new Uint8Array(digest)), state: randomToken()};
}

export function authorizeUrl(authorization: OAuthAuthorization, challenge: OAuthChallenge): string {
  const url = new URL(authorization.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', authorization.clientId);
  url.searchParams.set('redirect_uri', authorization.redirectUri);
  url.searchParams.set('scope', authorization.scope);
  url.searchParams.set('state', challenge.state);
  url.searchParams.set('code_challenge', challenge.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.href;
}

export function onCallback(state: string, handle: (callback: OAuthCallback) => void): () => void {
  const listener = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.source !== OAUTH_MESSAGE_SOURCE || data.state !== state) {
      return;
    }
    handle({
      code: typeof data.code === 'string' && data.code ? data.code : null,
      error: typeof data.error === 'string' && data.error ? data.error : null
    });
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
