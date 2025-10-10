import { ComponentPropsWithoutRef, forwardRef } from 'react';

const VisuallyHidden = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<'span'>>(
  ({ className, children, ...rest }, ref) => {
    const mergedClassName = className ? `sr-only ${className}` : 'sr-only';

    return (
      <span ref={ref} className={mergedClassName} {...rest}>
        {children}
      </span>
    );
  },
);

VisuallyHidden.displayName = 'VisuallyHidden';

export default VisuallyHidden;
