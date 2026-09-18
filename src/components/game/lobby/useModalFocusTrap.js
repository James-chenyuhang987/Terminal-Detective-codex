import { useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => {
    if (element.closest('[inert]')) return false;
    return element.getClientRects().length > 0;
  });
}

export function useModalFocusTrap(open, dialogRef, onClose, restoreRef) {
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousFocus = document.activeElement;
    const restoreTarget = restoreRef?.current || previousFocus;
    const focusInitial = () => {
      const first = getFocusableElements(dialog)[0] || dialog;
      first.focus();
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (!dialog.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const keepFocusInside = event => {
      if (!dialog.contains(event.target)) focusInitial();
    };

    focusInitial();
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', keepFocusInside);
      if (restoreTarget?.isConnected && typeof restoreTarget.focus === 'function') restoreTarget.focus();
    };
  }, [dialogRef, onClose, open, restoreRef]);
}
