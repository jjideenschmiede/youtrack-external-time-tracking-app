import type React from 'react';

export function submitOnEnter(event: React.KeyboardEvent, submit: () => void) {
  const target = event.target as HTMLElement;
  if (event.key !== 'Enter' || event.shiftKey || target.tagName !== 'INPUT') {
    return;
  }
  event.preventDefault();
  submit();
}
