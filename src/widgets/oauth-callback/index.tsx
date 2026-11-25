import React from 'react';
import ReactDOM from 'react-dom/client';
import '@jetbrains/ring-ui-built/components/style.css';
import Theme, {ThemeProvider} from '@jetbrains/ring-ui-built/components/global/theme';
import {ControlsHeightContext, ControlsHeight} from '@jetbrains/ring-ui-built/components/global/controls-height';
import {lang} from '../common/i18n';
import {OAUTH_MESSAGE_SOURCE} from '../common/oauth';

import {App} from './app';
import type {CallbackState} from './app';
import './app.css';

function readState(): CallbackState {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error_description') || params.get('error');
  let delivered = false;
  try {
    if (window.opener) {
      window.opener.postMessage({source: OAUTH_MESSAGE_SOURCE, code, state: params.get('state'), error}, '*');
      delivered = true;
    }
  } catch {
    delivered = false;
  }
  if (error || !code) {
    return {kind: 'error', error};
  }
  return delivered ? {kind: 'done'} : {kind: 'manual', code};
}

document.documentElement.lang = lang;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={Theme.AUTO} target={document.documentElement}>
      <ControlsHeightContext.Provider value={ControlsHeight.M}>
        <App state={readState()}/>
      </ControlsHeightContext.Provider>
    </ThemeProvider>
  </React.StrictMode>
);
