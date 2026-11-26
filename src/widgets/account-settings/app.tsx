import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size as InputSize} from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import newWindowIcon from '@jetbrains/icons/new-window';
import {createApi} from '../common/api';
import {submitOnEnter} from '../common/keyboard';
import {isOAuthAvailable} from '../common/oauth';
import {useOAuthConnect} from '../common/oauth-connect';
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

const OAuthConnect: React.FC<{
  provider: ProviderInfo;
  onConnected: (status: AccountStatus) => void;
  label?: string;
}> = ({provider, onConnected, label}) => {
  const api = useMemo(() => createApi(host), []);
  const {waiting, code, setCode, busy, error, start, reopen, submitCode, cancel} = useOAuthConnect(
    api, provider, onConnected
  );

  return (
    <>
      {error && (
        <Row>
          <Banner mode="error" withIcon inline>{error}</Banner>
        </Row>
      )}

      {!waiting && (
        <Row help={t('oauthHelp', {provider: provider.name})}>
          <div className="settings-actions">
            <Button primary onClick={start} disabled={busy} loader={busy}>
              {label ?? t('oauthConnect', {provider: provider.name})}
            </Button>
          </div>
        </Row>
      )}

      {waiting && (
        <>
          <Row help={t('oauthWaiting', {provider: provider.name})}>
            <div className="settings-actions">
              <Button onClick={reopen} disabled={busy} icon={newWindowIcon}>
                {t('oauthOpen')}
              </Button>
              <Button onClick={cancel} disabled={busy}>{t('cancel')}</Button>
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

const Connected: React.FC<{
  account: Account;
  provider: ProviderInfo | null;
  disconnecting: boolean;
  onDisconnect: () => void;
  onConnected: (status: AccountStatus) => void;
}> = ({account, provider, disconnecting, onDisconnect, onConnected}) => (
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
    {provider?.oauth && account.auth === 'apiKey' && isOAuthAvailable() && (
      <>
        <Row>
          <Banner mode="info" withIcon inline>{t('oauthSwitchHint', {provider: provider.name})}</Banner>
        </Row>
        <OAuthConnect provider={provider} onConnected={onConnected} label={t('oauthSwitch', {provider: provider.name})}/>
      </>
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

  const provider = selected?.provider ?? null;
  const oauth = !!provider?.oauth && isOAuthAvailable();
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
          }}
          size={Select.Size.M}
        />
      </Row>

      {provider && oauth && (
        <OAuthConnect
          key={provider.id}
          provider={provider}
          onConnected={onConnected}
        />
      )}

      {provider?.oauth && !oauth && (
        <Row>
          <Banner mode="info" withIcon inline>{t('oauthUnavailable', {provider: provider.name})}</Banner>
        </Row>
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
        <Connected
          account={status.account}
          provider={status.providers.find(provider => provider.id === status.account?.provider) ?? null}
          disconnecting={disconnecting}
          onDisconnect={handleDisconnect}
          onConnected={handleConnected}
        />
      )}
      {status && !status.account && <ConnectForm status={status} onConnected={handleConnected}/>}
      {status && <McpAddress host={host}/>}

    </div>
  );
};

export const App = memo(AppComponent);
