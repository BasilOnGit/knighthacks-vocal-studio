import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ICON_SIZE, ICON_STROKE } from './icons';

export function InspectorSection({
  title,
  icon: Icon,
  children,
  className = '',
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`inspector-stack ${className}`.trim()}>
      <h2 className="section-title-center">
        {Icon ? (
          <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
        ) : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function InspectorEmpty({ children }: { children: React.ReactNode }) {
  return <p className="inspector-empty">{children}</p>;
}
