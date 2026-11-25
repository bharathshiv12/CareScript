import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(20, 26, 33, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="cs-card w-full max-w-md p-6 relative animate-fadeIn">
        <button
          type="button"
          onClick={onCancel}
          aria-label={cancelLabel}
          className="absolute top-4 right-4 p-2 rounded-lg hover:opacity-80"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{
              backgroundColor: tone === 'danger' ? 'var(--color-danger-bg)' : 'var(--color-light-blue)',
              color: tone === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)',
            }}
          >
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1 pr-4">
            <h3 id="confirm-dialog-title" className="text-lg font-bold">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="cs-btn-secondary px-4 py-2.5 text-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2.5 text-sm font-semibold rounded-xl text-white"
            style={{
              backgroundColor: tone === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
