import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { copyText } from '../lib/format';
import { useToast } from '../toast';

export function Badge({
  children,
  tone = 'muted',
  className = '',
}: {
  children: ReactNode;
  tone?: 'gold' | 'green' | 'muted' | 'danger' | 'blue';
  className?: string;
}) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" />
      {label ? <span className="spinner-label">{label}</span> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {children ? <div className="empty-copy">{children}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal-head">
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'btn btn-ghost btn-sm',
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = useCallback(async () => {
    try {
      await copyText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Could not copy to the clipboard.', 'error');
    }
  }, [value, toast]);

  return (
    <button type="button" className={className} onClick={handleCopy}>
      {copied ? copiedLabel : label}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description ? <span className="toggle-description">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}
