import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size as InputSize} from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import newWindowIcon from '@jetbrains/icons/new-window';
import {createApi} from '../common/api';
import {submitOnEnter} from '../common/keyboard';
import {authorizeUrl, callbackUrl, createChallenge, isOAuthAvailable, onCallback} from '../common/oauth';
import type {Account, AccountStatus, ProviderInfo} from '../common/types';
import {t} from '../common/i18n';
import {McpAddress} from './mcp-address';

const host = await YTApp.register();
const isOwnProfile = !YTApp.entity || !YTApp.me || YTApp.entity.id === YTApp.me.id;

interface ProviderItem {
  key: string;
  label: string;
  provider: ProviderInfo;
}

interface PendingOAuth {
  url: string;
  verifier: string;
  state: string;
  redirectUri: string;
}

const Row: React.FC<{label?: string; htmlFor?: string; help?: React.ReactNode; children: React.ReactNode}> = (
  {label, htmlFor, help, children}
) => (
  <>
    <label className="settings-label" htmlFor={htmlFor}>{label}</label>
    <div className="settings-control">
      {children}
      {help && <div className="settings-help">{help}</div>}
    </div>
  </>
);

const Connected: React.FC<{account: Account; disconnecting: boolean; onDisconnect: () => void}> = (
  {account, disconnecting, onDisconnect}
) => (
  <div className="settings-grid">
    <Row label={t('provider')}>
      <span className="settings-value">{account.providerName}</span>
    </Row>
    <Row label={t('account')} help={account.email || null}>
      <span className="settings-value">{account.name}</span>
    </Row>
    {account.company && (
      <Row label={t('company')}>
        <span className="settings-value">{account.company}</span>
      </Row>
    )}
    <Row>
      <div className="settings-actions">
        <Button danger loader={disconnecting} disabled={disconnecting} onClick={onDisconnect}>
          {t('disconnect')}
        </Button>
        {account.links.map(link => (
          <Button key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" icon={newWindowIcon}>
            {link.label}
          </Button>
        ))}
      </div>
    </Row>
  </div>
);

const OAuthConnect: React.FC<{
  provider: ProviderInfo;
  onConnected: (status: AccountStatus) => void;
  onUseApiKey: () => void;
}> = ({provider, onConnected, onUseApiKey}) => {
  const api = useMemo(() => createApi(host), []);
  const [pending, setPending] = useState<PendingOAuth | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);
  const available = isOAuthAvailable();

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

  const start = async () => {
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
  };

  const submitCode = () => {
    if (pending && code.trim()) {
      finish(code.trim(), pending);
    }
  };

  return (
    <>
      {error && (
        <Row>
          <Banner mode="error" withIcon inline>{error}</Banner>
        </Row>
      )}

      {!pending && (
        <Row help={t(available ? 'oauthHelp' : 'oauthUnavailable', {provider: provider.name})}>
          <div className="settings-actions">
            <Button primary onClick={start} disabled={!available || busy} loader={busy}>
              {t('oauthConnect', {provider: provider.name})}
            </Button>
            <Button onClick={onUseApiKey} disabled={busy}>{t('useApiKey')}</Button>
          </div>
        </Row>
      )}

      {pending && (
        <>
          <Row help={t('oauthWaiting', {provider: provider.name})}>
            <div className="settings-actions">
              <Button onClick={() => window.open(pending.url, '_blank')} disabled={busy} icon={newWindowIcon}>
                {t('oauthOpen')}
              </Button>
              <Button onClick={() => reset(null)} disabled={busy}>{t('cancel')}</Button>
            </div>
          </Row>
          <Row label={t('oauthCode')} htmlFor="oauth-code" help={t('oauthCodeHelp')}>
            <Input
              id="oauth-code"
              autoComplete="off"
              value={code}
              size={InputSize.M}
              onKeyDown={event => submitOnEnter(event, submitCode)}
              onChange={e => setCode(e.target.value)}
            />
            <div className="settings-actions">
              <Button primary onClick={submitCode} disabled={!code.trim() || busy} loader={busy}>
                {t('connect')}
              </Button>
            </div>
          </Row>
        </>
      )}
    </>
  );
};

const ConnectForm: React.FC<{status: AccountStatus; onConnected: (status: AccountStatus) => void}> = (
  {status, onConnected}
) => {
  const api = useMemo(() => createApi(host), []);
  const items = useMemo<ProviderItem[]>(
    () => status.providers.map(provider => ({key: provider.id, label: provider.name, provider})),
    [status.providers]
  );
  const [selected, setSelected] = useState<ProviderItem | null>(items.length === 1 ? items[0] : null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useApiKey, setUseApiKey] = useState(false);

  const provider = selected?.provider ?? null;
  const oauth = !!provider?.oauth && !useApiKey;
  const complete = !!provider && provider.credentialFields.every(field => (values[field.key] ?? '').trim() !== '');

  const submit = async () => {
    if (!provider || !complete) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const trimmed: Record<string, string> = {};
      provider.credentialFields.forEach(field => {
        trimmed[field.key] = (values[field.key] ?? '').trim();
      });
      onConnected(await api.connect(provider.id, trimmed));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-grid">
      <Row label={t('provider')}>
        <Select<ProviderItem>
          data={items}
          selected={selected}
          label={t('provider')}
          onSelect={item => {
            setSelected(item);
            setValues({});
            setError(null);
            setUseApiKey(false);
          }}
          size={Select.Size.M}
        />
      </Row>

      {provider && oauth && (
        <OAuthConnect
          key={provider.id}
          provider={provider}
          onConnected={onConnected}
          onUseApiKey={() => setUseApiKey(true)}
        />
      )}

      {provider && !oauth && provider.credentialFields.map((field, index) => {
        const id = `credential-${field.key}`;
        const isLast = index === provider.credentialFields.length - 1;
        return (
          <Row
            key={`${provider.id}-${field.key}`}
            label={field.label}
            htmlFor={id}
            help={isLast ? provider.credentialHelp : field.help}
          >
            <Input
              id={id}
              type={field.type === 'secret' ? 'password' : field.type}
              autoComplete={field.type === 'secret' ? 'new-password' : 'off'}
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              size={InputSize.M}
              onKeyDown={event => submitOnEnter(event, submit)}
              onChange={e => {
                const value = e.target.value;
                setValues(prev => ({...prev, [field.key]: value}));
              }}
            />
          </Row>
        );
      })}

      {error && !oauth && (
        <Row>
          <Banner mode="error" withIcon inline>{error}</Banner>
        </Row>
      )}

      {!oauth && (
        <Row help={t('credentialsNotice')}>
          <div className="settings-actions">
            <Button primary onClick={submit} disabled={!complete || saving} loader={saving}>
              {t('connect')}
            </Button>
            {provider?.oauth && (
              <Button onClick={() => setUseApiKey(false)} disabled={saving}>
                {t('useOAuth', {provider: provider.name})}
              </Button>
            )}
          </div>
        </Row>
      )}
    </div>
  );
};

const AppComponent: React.FunctionComponent = () => {
  const api = useMemo(() => createApi(host), []);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isOwnProfile) {
      return;
    }
    api.getAccount()
      .then(setStatus)
      .catch(e => setError(e instanceof Error ? e.message : t('statusLoadFailed')));
  }, [api]);

  const handleConnected = useCallback((next: AccountStatus) => {
    setStatus(next);
    host.alert(t('connectedTo', {provider: next.account?.providerName ?? ''}));
  }, []);

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      setStatus(await api.disconnect());
      host.alert(t('disconnected'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('disconnectFailed'));
    } finally {
      setDisconnecting(false);
    }
  }, [api]);

  return (
    <div className="settings">
      <p className="settings-intro">{t('settingsIntro')}</p>

      {!isOwnProfile && <Banner mode="info" withIcon inline>{t('ownProfileOnly')}</Banner>}
      {error && <Banner mode="error" withIcon inline>{error}</Banner>}
      {isOwnProfile && !status && !error && <LoaderInline/>}

      {status?.account && (
        <Connected account={status.account} disconnecting={disconnecting} onDisconnect={handleDisconnect}/>
      )}
      {status && !status.account && <ConnectForm status={status} onConnected={handleConnected}/>}
      {status && <McpAddress host={host}/>}

    </div>
  );
};

export const App = memo(AppComponent);
