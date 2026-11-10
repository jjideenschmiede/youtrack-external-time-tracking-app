import React, {useCallback, useEffect, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Link from '@jetbrains/ring-ui-built/components/link/link';
import copyIcon from '@jetbrains/icons/copy';
import type {HostAPI} from '../../../@types/globals';
import {t} from '../common/i18n';

const APP_PACKAGE = 'external-time-tracking';
const GUIDE_URLS = {
  cloud: 'https://www.jetbrains.com/help/youtrack/cloud/model-context-protocol-server.html',
  server: 'https://www.jetbrains.com/help/youtrack/server/model-context-protocol-server.html'
};

function guideUrl(base: string | null): string {
  try {
    return base && new URL(base).hostname.endsWith('.youtrack.cloud') ? GUIDE_URLS.cloud : GUIDE_URLS.server;
  } catch {
    return GUIDE_URLS.server;
  }
}

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

function copyWithSelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

function selectText(element: HTMLElement | null) {
  const selection = window.getSelection();
  if (!element || !selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export const McpAddress: React.FC<{host: HostAPI}> = ({host}) => {
  const [address, setAddress] = useState<string | null>(null);
  const [guide, setGuide] = useState(GUIDE_URLS.server);
  const [code, setCode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    youtrackUrl(host).then(base => {
      setGuide(guideUrl(base));
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
      if (copyWithSelection(address)) {
        host.alert(t('mcpCopied'));
        return;
      }
    }
    selectText(code);
    host.alert(t('mcpCopyManually'));
  }, [address, code, host]);

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{t('mcpTitle')}</h3>
      <p className="settings-section-text">{t('mcpIntro')}</p>
      <div className="settings-copy">
        <code ref={setCode} className="settings-code">{address ?? ''}</code>
        <Button inline icon={copyIcon} disabled={!address} onClick={copy}>{t('mcpCopy')}</Button>
      </div>
      <Link href={guide} target="_blank" rel="noopener noreferrer" className="ett-small">{t('mcpGuide')}</Link>
    </section>
  );
};
