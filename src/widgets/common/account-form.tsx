import React, {useMemo, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size as InputSize} from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import Link from '@jetbrains/ring-ui-built/components/link/link';
import Text from '@jetbrains/ring-ui-built/components/text/text';
import Banner from '@jetbrains/ring-ui-built/components/banner/banner';
import type {Api} from './api';
import {submitOnEnter} from './keyboard';
import {isOAuthAvailable} from './oauth';
import {useOAuthConnect} from './oauth-connect';
import type {Account, AccountStatus, ProviderInfo} from './types';
import {t} from './i18n';

interface ProviderItem {
  key: string;
  label: string;
  provider: ProviderInfo;
}

function toItem(provider: ProviderInfo): ProviderItem {
  return {key: provider.id, label: provider.name, provider};
}

export const ConnectedAccount: React.FC<{
  account: Account;
  onDisconnect?: () => void;
  disconnecting?: boolean;
}> = ({account, onDisconnect, disconnecting}) => (
  <div className="ett-account">
    <div className="ett-account-row">
      <span className="ett-label">{t('provider')}</span>
      <span>{account.providerName}</span>
    </div>
    <div className="ett-account-row">
      <span className="ett-label">{t('account')}</span>
      <span>
        {account.name}
        {account.email && <Text info>{` · ${account.email}`}</Text>}
      </span>
    </div>
    {account.company && (
      <div className="ett-account-row">
        <span className="ett-label">{t('company')}</span>
        <span>{account.company}</span>
      </div>
    )}
    {onDisconnect && (
      <div className="ett-actions">
        <Button danger loader={disconnecting} disabled={disconnecting} onClick={onDisconnect}>
          {t('disconnect')}
        </Button>
      </div>
    )}
  </div>
);

const OAuthForm: React.FC<{
  api: Api;
  provider: ProviderInfo;
  onConnected: (status: AccountStatus) => void;
}> = ({api, provider, onConnected}) => {
  const {waiting, code, setCode, busy, error, start, reopen, submitCode, cancel} = useOAuthConnect(
    api, provider, onConnected
  );

  return (
    <>
      <Text size={Text.Size.S} info>
        {t(waiting ? 'oauthWaiting' : 'oauthHelp', {provider: provider.name})}
      </Text>

      {error && <Banner mode="error" withIcon inline>{error}</Banner>}

      {!waiting && (
        <div className="ett-actions">
          <Button primary onClick={start} disabled={busy} loader={busy}>
            {t('oauthConnect', {provider: provider.name})}
          </Button>
        </div>
      )}

      {waiting && (
        <>
          <Input
            label={t('oauthCode')}
            autoComplete="off"
            help={t('oauthCodeHelp')}
            value={code}
            size={InputSize.FULL}
            onKeyDown={event => submitOnEnter(event, submitCode)}
            onChange={e => setCode(e.target.value)}
          />
          <div className="ett-actions">
            <Button primary onClick={submitCode} disabled={!code.trim() || busy} loader={busy}>
              {t('connect')}
            </Button>
            <Button onClick={reopen} disabled={busy}>{t('oauthOpen')}</Button>
            <Button onClick={cancel} disabled={busy}>{t('cancel')}</Button>
          </div>
        </>
      )}
    </>
  );
};

export const AccountForm: React.FC<{
  api: Api;
  status: AccountStatus;
  onChange: (status: AccountStatus) => void;
  compact?: boolean;
}> = ({api, status, onChange, compact}) => {
  const items = useMemo(() => status.providers.map(toItem), [status.providers]);
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
      const next = await api.connect(provider.id, trimmed);
      setValues({});
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ett-form">
      {!compact && !oauth && (
        <Text info>
          {t('credentialsNotice')}
        </Text>
      )}

      <Select<ProviderItem>
        label={t('provider')}
        selectedLabel={t('provider')}
        data={items}
        selected={selected}
        onSelect={item => {
          setSelected(item);
          setValues({});
          setError(null);
        }}
        size={Select.Size.FULL}
      />

      {provider && oauth && <OAuthForm key={provider.id} api={api} provider={provider} onConnected={onChange}/>}

      {provider?.oauth && !oauth && (
        <Banner mode="info" withIcon inline>{t('oauthUnavailable', {provider: provider.name})}</Banner>
      )}

      {provider && !oauth && provider.credentialFields.map(field => (
        <Input
          key={`${provider.id}-${field.key}`}
          label={field.label}
          type={field.type === 'secret' ? 'password' : field.type}
          autoComplete={field.type === 'secret' ? 'new-password' : 'off'}
          placeholder={field.placeholder}
          help={field.help}
          value={values[field.key] ?? ''}
          size={InputSize.FULL}
          onKeyDown={event => submitOnEnter(event, submit)}
          onChange={e => {
            const value = e.target.value;
            setValues(prev => ({...prev, [field.key]: value}));
          }}
        />
      ))}

      {!oauth && provider?.credentialHelp && (
        <Text size={Text.Size.S} info>
          {provider.credentialHelp}
          {provider.credentialHelpUrl && (
            <>
              {' '}
              <Link href={provider.credentialHelpUrl} target="_blank" rel="noopener noreferrer">{t('learnMore')}</Link>
            </>
          )}
        </Text>
      )}

      {error && !oauth && <Banner mode="error" withIcon inline>{error}</Banner>}

      {!oauth && (
        <div className="ett-actions">
          <Button primary onClick={submit} disabled={!complete || saving} loader={saving}>
            {t('connect')}
          </Button>
        </div>
      )}
    </div>
  );
};
