import React, {useCallback, useEffect, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input, {Size as InputSize} from '@jetbrains/ring-ui-built/components/input/input';
import Link from '@jetbrains/ring-ui-built/components/link/link';
import copyIcon from '@jetbrains/icons/copy';
import type {HostAPI} from '../../../@types/globals';
import {t} from '../common/i18n';

const APP_PACKAGE = 'external-time-tracking';
const GUIDE_URL = 'https://plugins.jetbrains.com/plugin/35793-external-time-tracking';

function pageOrigin(): string | null {
  const ancestors = window.location.ancestorOrigins;
  if (ancestors && ancestors.length > 0) {
    return ancestors[ancestors.length - 1];
  }
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

async function youtrackUrl(host: HostAPI): Promise<string | null> {
  try {
    const settings = await host.fetchYouTrack<{baseUrl?: string}>('admin/globalSettings/systemSettings?fields=baseUrl');
    if (settings && settings.baseUrl) {
      return settings.baseUrl.replace(/\/+$/, '');
    }
  } catch {
    return pageOrigin();
  }
  return pageOrigin();
}

function copyFromInput(input: HTMLInputElement | null): boolean {
  if (!input) {
    return false;
  }
  input.focus();
  input.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

export const McpAddress: React.FC<{host: HostAPI}> = ({host}) => {
  const [address, setAddress] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    youtrackUrl(host).then(base => {
      setAddress(`${base ?? 'https://youtrack.example.com'}/mcp?customToolPackages=${APP_PACKAGE}`);
    });
  }, [host]);

  const copy = useCallback(async () => {
    if (!address) {
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      host.alert(t('mcpCopied'));
      return;
    } catch {
      if (copyFromInput(field.current)) {
        host.alert(t('mcpCopied'));
        return;
      }
    }
    field.current?.select();
    host.alert(t('mcpCopyManually'));
  }, [address, host]);

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{t('mcpTitle')}</h3>
      <p className="settings-section-text">{t('mcpIntro')}</p>
      <div className="settings-copy">
        <Input
          inputRef={field}
          readOnly
          value={address ?? ''}
          size={InputSize.FULL}
          aria-label={t('mcpTitle')}
          onFocus={event => event.target.select()}
        />
        <Button icon={copyIcon} disabled={!address} onClick={copy}>{t('mcpCopy')}</Button>
      </div>
      <Link href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className="ett-small">{t('mcpGuide')}</Link>
    </section>
  );
};
