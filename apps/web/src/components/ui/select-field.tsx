import { useId, type SelectHTMLAttributes } from 'react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export function SelectField({ label, children, className = '', ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
        {label}
      </label>
      <select
        {...props}
        id={id}
        className={`h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink ${className}`}
      >
        {children}
      </select>
    </div>
  );
}
