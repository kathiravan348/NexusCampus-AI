import React from 'react';

export type DialogVariant = 'default' | 'danger' | 'warning' | 'success' | 'info';

export interface ConfirmOptions {
  title: string;
  message: string | React.ReactNode;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface DialogInstance {
  id: string;
  component: React.ComponentType<any>;
  props?: Record<string, any>;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'drawer';
}

export interface DialogContextType {
  openDialog: (id: string, component: React.ComponentType<any>, props?: Record<string, any>, options?: { title?: string; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'drawer' }) => void;
  closeDialog: (id?: string) => void;
  openConfirm: (options: ConfirmOptions) => void;
  closeConfirm: () => void;
}
