import React, {useEffect, useState} from 'react';
import {formatElapsed} from './duration';

const TICK_MS = 1000;

export const Elapsed: React.FC<{start: string; className?: string}> = ({start, className}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return <span className={`ett-duration ${className ?? ''}`}>{formatElapsed((now - new Date(start).getTime()) / 1000)}</span>;
};
