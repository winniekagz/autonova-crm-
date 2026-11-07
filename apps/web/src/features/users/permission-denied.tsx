import Link from 'next/link';
import { Alert } from '@/components/ui/alert';

export function PermissionDenied({ what }: { what: string }) {
  return (
    <div className="max-w-xl space-y-3">
      <Alert tone="error">
        <p className="font-medium">Access denied</p>
        <p className="mt-1">
          You do not have permission to {what}. Ask a Director if you need access.
        </p>
      </Alert>
      <Link href="/" className="text-primary underline">
        Back to home
      </Link>
    </div>
  );
}
