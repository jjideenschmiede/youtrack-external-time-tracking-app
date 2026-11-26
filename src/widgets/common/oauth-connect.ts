import {useCallback, useEffect, useRef, useState} from 'react';
import type {Api} from './api';
import {authorizeUrl, callbackUrl, createChallenge, onCallback} from './oauth';
import type {AccountStatus, ProviderInfo} from './types';
import {t} from './i18n';

interface PendingOAuth {
  url: string;
  verifier: string;
  state: string;
  redirectUri: string;
}

export function useOAuthConnect(api: Api, provider: ProviderInfo, onConnected: (status: AccountStatus) => void) {
  const [pending, setPending] = useState<PendingOAuth | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  const reset = useCallback((message: string | null) => {
    setPending(null);
    setCode('');
    setError(message);
  }, []);

  const finish = useCallback(async (grantCode: string, current: PendingOAuth) => {
    if (finishing.current) {
      return;
    }
    finishing.current = true;
    setBusy(true);
    setError(null);
    try {
      onConnected(await api.connectOAuth(provider.id, {
        code: grantCode,
        verifier: current.verifier,
        redirectUri: current.redirectUri
      }));
    } catch (e) {
      reset(e instanceof Error ? e.message : t('connectFailed'));
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  }, [api, provider.id, onConnected, reset]);

  useEffect(() => {
    if (!pending) {
      return undefined;
    }
    return onCallback(pending.state, callback => {
      if (callback.code) {
        finish(callback.code, pending);
      } else {
        reset(callback.error ?? t('oauthNoCode'));
      }
    });
  }, [pending, finish, reset]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [challenge, authorization] = await Promise.all([
        createChallenge(),
        api.startOAuth(provider.id, callbackUrl())
      ]);
      const url = authorizeUrl(authorization, challenge);
      window.open(url, '_blank');
      setPending({url, verifier: challenge.verifier, state: challenge.state, redirectUri: authorization.redirectUri});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectFailed'));
    } finally {
      setBusy(false);
    }
  }, [api, provider.id]);

  const reopen = useCallback(() => {
    if (pending) {
      window.open(pending.url, '_blank');
    }
  }, [pending]);

  const submitCode = useCallback(() => {
    if (pending && code.trim()) {
      finish(code.trim(), pending);
    }
  }, [pending, code, finish]);

  const cancel = useCallback(() => reset(null), [reset]);

  return {waiting: !!pending, code, setCode, busy, error, start, reopen, submitCode, cancel};
}
