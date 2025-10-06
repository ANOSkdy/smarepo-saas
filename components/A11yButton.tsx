'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

type A11yButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const A11yButton = forwardRef<HTMLButtonElement, A11yButtonProps>(
  ({ className, type = 'button', ...rest }, ref) => {
    const baseClassName =
      'tap-target inline-flex min-w-[var(--tap-min)] items-center justify-center gap-2 rounded-lg border border-brand-border bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primaryText shadow-sm transition hover:bg-brand-primary/90 focus-visible:ring-4 focus-visible:ring-brand-focus/40 disabled:border-brand-border disabled:bg-brand-border disabled:text-brand-muted disabled:shadow-none disabled:[background-image:repeating-linear-gradient(-45deg,rgba(17,24,39,0.18),rgba(17,24,39,0.18)_4px,transparent_4px,transparent_8px)] disabled:[color:rgba(17,24,39,0.75)] disabled:cursor-not-allowed';

    const mergedClassName = className ? `${baseClassName} ${className}` : baseClassName;

    return <button ref={ref} type={type} className={mergedClassName} {...rest} />;
  },
);

A11yButton.displayName = 'A11yButton';

export default A11yButton;
