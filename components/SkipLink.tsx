import { ComponentPropsWithoutRef } from 'react';

type SkipLinkProps = ComponentPropsWithoutRef<'a'>;

export default function SkipLink({
  children = '本文へスキップ',
  className,
  href = '#main',
  ...rest
}: SkipLinkProps) {
  const baseClassName =
    'skip-link sr-only tap-target focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-brand-border focus:bg-brand-surface-alt focus:px-4 focus:py-3 focus:text-brand-text focus:shadow-lg';

  const mergedClassName = className ? `${baseClassName} ${className}` : baseClassName;

  return (
    <a href={href} className={mergedClassName} {...rest}>
      {children}
    </a>
  );
}
