'use client';

import { PermissionKey } from '@autonova/enums';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-context';
import { can } from './permissions';

/**
 * Minimal protected layout: header with navigation and sign-out. It is intentionally small —
 * the full sidebar shell (docs/webdesign.md §4) is a later task. Navigation shows only what the
 * user can use; the API enforces every permission regardless.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  // No session in memory: first visit, a reload (no refresh tokens yet), or a revoked session.
  useEffect(() => {
    if (!me && !signingOut) router.replace('/login');
  }, [me, router, signingOut]);

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
    { href: '/users', label: 'Users', show: can(me, PermissionKey.UsersList) },
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
        {me.restricted ? (
          <Alert tone="warning">
            <p className="font-medium">Two-factor verification required</p>
            <p className="mt-1">
              Directors must verify a second factor before using the CRM. This step is not available
              yet, so access is limited to this page and signing out.
            </p>
          </Alert>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
