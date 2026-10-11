import React from 'react';

export function ToggleButton({
  pressed,
  disabled,
  onToggle,
  children,
  title,
  className = '',
  size = 'default',
  variant = 'default',
}: {
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
  size?: 'sm' | 'default';
  /** default: purple when on; onOff: green on / red off; monitor: green when on, default when off */
  variant?: 'default' | 'onOff' | 'monitor';
}) {
  return (
    <button
      type="button"
      className={[
        'toggle-btn',
        variant === 'onOff'
          ? pressed
            ? 'toggle-btn--onOff-on'
            : 'toggle-btn--onOff-off'
          : variant === 'monitor'
            ? pressed
              ? 'toggle-btn--monitor-on'
              : ''
            : pressed
              ? 'toggle-btn--on'
              : '',
        size === 'sm' ? 'toggle-btn--sm' : '',
        variant === 'onOff' ? 'toggle-btn--onOff' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}
