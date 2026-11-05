import React, {useEffect} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import closeIcon from '@jetbrains/icons/close';
import {t} from './i18n';

export const TimeDialog: React.FC<{
  title: string;
  onClose: () => void;
  overlay?: boolean;
  hidden?: boolean;
  children: React.ReactNode;
}> = ({title, onClose, overlay = false, hidden = false, children}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={`ett-modal-backdrop ${overlay ? 'ett-modal-backdrop--overlay' : ''}`}>
      <div className={`ett-modal ${hidden ? 'ett-modal--hidden' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <Button
          className="ett-modal-close"
          iconClassName="ett-modal-close-icon"
          icon={closeIcon}
          aria-label={t('cancel')}
          onClick={onClose}
        />
        <h2 className="ett-modal-title">
          <img className="ett-modal-icon" src="widget-icon.svg" alt=""/>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
};
