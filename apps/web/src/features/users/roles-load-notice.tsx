import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Inline notice for a failed role request; the rest of the page keeps working around it. */
export function RolesLoadNotice({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="space-y-2">
      <Alert tone="warning">
        Role information could not be loaded, so {what} is unavailable for now. Nothing else on this
        page is affected.
      </Alert>
      <Button variant="secondary" onClick={onRetry} aria-label="Try loading roles again">
        Try again
      </Button>
    </div>
  );
}
