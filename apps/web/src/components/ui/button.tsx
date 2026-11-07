import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const STYLES: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-ink-muted',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas disabled:text-ink-muted',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = 'primary', className = '', ...props }, ref) {
  return (
    <button
      {...props}
      ref={ref}
      className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${STYLES[variant]} ${className}`}
    />
  );
});
