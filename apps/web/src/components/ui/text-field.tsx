import { useId, type ComponentProps } from 'react';

// `ComponentProps` (not InputHTMLAttributes) so `ref` is part of the type: React Hook Form's
// `register()` hands the field a ref, and React 19 passes it through as an ordinary prop.
interface TextFieldProps extends ComponentProps<'input'> {
  label: string;
  error?: string | undefined;
}

export function TextField({ label, error, className = '', ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
