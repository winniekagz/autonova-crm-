import type { UserStatus } from '@autonova/enums';

/** Status is always text plus colour, never colour alone (docs/webdesign.md §3.2). */
const STYLE: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-success-soft text-success' },
  INVITED: { label: 'Invited', className: 'bg-warning-soft text-warning' },
  DISABLED: { label: 'Disabled', className: 'bg-canvas text-ink-soft border border-line' },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { label, className } = STYLE[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
