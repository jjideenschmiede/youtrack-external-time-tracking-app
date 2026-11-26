import React, {memo, useEffect, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import Input, {Size as InputSize} from '@jetbrains/ring-ui-built/components/input/input';
import successIcon from '@jetbrains/icons/success';
import exceptionIcon from '@jetbrains/icons/exception';
import copyIcon from '@jetbrains/icons/copy';
import {t} from '../common/i18n';

export type CallbackState =
  | {kind: 'done'}
  | {kind: 'error'; error: string | null}
  | {kind: 'manual'; code: string};

const CLOSE_DELAY = 1500;

const ManualCode: React.FC<{code: string}> = ({code}) => {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLDivElement>(null);

  const copy = async () => {
    const input = field.current?.querySelector('textarea');
    input?.focus();
    input?.select();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(document.execCommand('copy'));
    }
  };

  return (
    <div className="callback-code" ref={field}>
      <Input
        multiline
        readOnly
        label={t('oauthCode')}
        value={code}
        size={InputSize.FULL}
        onFocus={event => event.target.select()}
      />
      <Button primary onClick={copy}>
        {t(copied ? 'callbackCopied' : 'callbackCopy')}
      </Button>
    </div>
  );
};

const AppComponent: React.FC<{state: CallbackState}> = ({state}) => {
  useEffect(() => {
    if (state.kind !== 'done') {
      return undefined;
    }
    const timer = window.setTimeout(() => window.close(), CLOSE_DELAY);
    return () => window.clearTimeout(timer);
  }, [state.kind]);

  if (state.kind === 'manual') {
    return (
      <div className="callback">
        <ErrorMessage
          icon={copyIcon}
          message={t('callbackManualTitle')}
          description={t('callbackManualText')}
        >
          <ManualCode code={state.code}/>
        </ErrorMessage>
      </div>
    );
  }

  const failed = state.kind === 'error';
  return (
    <div className={failed ? 'callback callback-error' : 'callback callback-done'}>
      <ErrorMessage
        icon={failed ? exceptionIcon : successIcon}
        message={t(failed ? 'callbackErrorTitle' : 'callbackDoneTitle')}
        description={failed ? state.error ?? t('callbackEmptyText') : t('callbackDoneText')}
      >
        <Button onClick={() => window.close()}>{t('callbackClose')}</Button>
      </ErrorMessage>
    </div>
  );
};

export const App = memo(AppComponent);
