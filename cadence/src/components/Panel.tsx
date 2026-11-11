import type { CSSProperties, ReactNode } from 'react';

export function Panel({
  title,
  actions,
  children,
  className = '',
  scroll = true,
  bodyClassName = '',
  style,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  scroll?: boolean;
  bodyClassName?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style} aria-label={typeof title === 'string' ? title : undefined}>
      <header className="panel-header">
        <span className="panel-title">{title}</span>
        <span className="panel-header-spacer" />
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      <div className={`panel-body ${bodyClassName}`} style={scroll ? undefined : { overflow: 'hidden' }}>
        {children}
      </div>
    </section>
  );
}
