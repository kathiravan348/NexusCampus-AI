import React from 'react';
import { AlertTriangle, Info, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { ConfirmOptions } from './types';

interface ConfirmDialogProps {
  options: ConfirmOptions | null;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ options, onClose }) => {
  if (!options) return null;

  const {
    title,
    message,
    variant = 'default',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel
  } = options;

  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onClose();
  };

  const variantStyles = {
    default: {
      icon: <Info className="w-6 h-6 text-primary" />,
      button: 'bg-primary hover:bg-primary/90 text-white',
      badge: 'bg-primary/10 border-primary/20 text-primary'
    },
    danger: {
      icon: <AlertTriangle className="w-6 h-6 text-danger" />,
      button: 'bg-danger hover:bg-danger/90 text-white',
      badge: 'bg-danger/10 border-danger/20 text-danger'
    },
    warning: {
      icon: <AlertCircle className="w-6 h-6 text-warning" />,
      button: 'bg-warning hover:bg-warning/90 text-white',
      badge: 'bg-warning/10 border-warning/20 text-warning'
    },
    success: {
      icon: <CheckCircle2 className="w-6 h-6 text-success" />,
      button: 'bg-success hover:bg-success/90 text-white',
      badge: 'bg-success/10 border-success/20 text-success'
    },
    info: {
      icon: <Info className="w-6 h-6 text-info" />,
      button: 'bg-info hover:bg-info/90 text-white',
      badge: 'bg-info/10 border-info/20 text-info'
    }
  };

  const current = variantStyles[variant] || variantStyles.default;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-bg-1 border border-line rounded-2xl shadow-2xl p-6 relative flex flex-col gap-4 animate-scale-up"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-fg-2 hover:text-fg-0 hover:bg-bg-2 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl border ${current.badge} shrink-0`}>
            {current.icon}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-fg-0">{title}</h3>
            <div className="mt-1.5 text-sm text-fg-2 leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-line">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 border border-line rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all ${current.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
