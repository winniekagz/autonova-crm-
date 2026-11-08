'use client';

import { PermissionKey } from '@autonova/enums';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DirectorMfa, RecoveryCodes } from './director-mfa';
import { useAuth } from './auth-context';
import { can } from './permissions';

/**
 * Minimal protected layout: header with navigation and sign-out. It is intentionally small —
 * the full sidebar shell (docs/webdesign.md §4) is a later task. Navigation shows only what the
 * user can use; the API enforces every permission regardless.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, me, signOut, retryRestore } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Definitively signed out: first visit, an ended/revoked/expired session or a rejected refresh.
  // Not while `restoring` (we do not know yet) or `unavailable` (the session may still be valid).
  useEffect(() => {
    if (status === 'unauthenticated' && !signingOut) router.replace('/login');
  }, [status, router, signingOut]);

  // Nothing user-specific is rendered, on the server or the client, until the session is proven.
  if (status === 'restoring') {
    return (
      <p role="status" className="p-6 text-ink-soft">
        Checking your session…
      </p>
    );
  }
  if (status === 'unavailable') {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <Alert tone="warning">
          <p className="font-medium">Could not check your session</p>
          <p className="mt-1">
            The server did not answer. You have not been signed out. Check your connection and try
            again.
          </p>
        </Alert>
        <Button variant="secondary" onClick={retryRestore}>
          Try again
        </Button>
      </div>
    );
  }
  if (!me) return <p className="p-6 text-ink-soft">Redirecting to sign in…</p>;

  async function onSignOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
    } catch {
      setSignOutError(true);
    }
    router.replace('/login');
  }

  const links = [
    { href: '/', label: 'Home', show: true },
    { href: '/leads', label: 'Leads', show: can(me, PermissionKey.LeadsList) },
    { href: '/companies', label: 'Companies', show: can(me, PermissionKey.CompaniesList) },
    { href: '/users', label: 'Users', show: can(me, PermissionKey.UsersList) },
    { href: '/sessions', label: 'Sessions', show: true },
  ].filter((link) => link.show);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-xs font-semibold tracking-widest text-primary uppercase">
            Autonova
          </span>
          <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
            {links.map((link) => {
              const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-md px-3 py-2 text-sm ${
                    active ? 'bg-canvas font-medium text-navy' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <span className="hidden text-[13px] text-ink-soft sm:inline">{me.fullName}</span>
          <Button variant="secondary" onClick={onSignOut} disabled={signingOut} className="h-9">
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {signOutError ? (
          <div className="mb-4">
            <Alert tone="warning">
              Could not end the session on the server. You have been signed out on this device.
            </Alert>
          </div>
        ) : null}
        {recoveryCodes ? (
          <RecoveryCodes codes={recoveryCodes} onDismiss={() => setRecoveryCodes(null)} />
        ) : null}
        {me.restricted ? <DirectorMfa onRecoveryCodes={setRecoveryCodes} /> : children}
      </main>
    </div>
  );
}
