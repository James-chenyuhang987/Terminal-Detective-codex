import { createPortal } from 'react-dom';

export default function StatusToast({ toast, successEyebrow, errorEyebrow }) {
  if (!toast || typeof document === 'undefined') return null;
  const isError = toast.type === 'error';

  return createPortal(
    <div className="td-toast-layer" aria-live={isError ? 'assertive' : 'polite'}>
      <div key={toast.id} className={`td-toast is-${isError ? 'error' : 'success'}`} role={isError ? 'alert' : 'status'}>
        <span className="td-toast-icon" aria-hidden="true">{isError ? '!' : '✓'}</span>
        <span className="td-toast-copy">
          <small>{isError ? errorEyebrow : successEyebrow}</small>
          <strong>{toast.message}</strong>
        </span>
        <span className="td-toast-timer" aria-hidden="true" />
      </div>
    </div>,
    document.body
  );
}
