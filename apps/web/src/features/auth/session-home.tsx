'use client';

import { PipelineCard } from '@/features/sales/pipeline-card';
import { useAuth } from './auth-context';
import { roleLabel } from './roles';

/** Placeholder signed-in landing page, replaced by the dashboard. */
export function SessionHome() {
  const { me } = useAuth();
  if (!me) return null; // the shell redirects when there is no session

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-navy">Welcome, {me.fullName}</h1>
      <p className="mt-1 text-ink-soft">{me.email}</p>

      <section
        aria-labelledby="roles-heading"
        className="mt-6 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="roles-heading" className="text-base font-semibold">
          Your access
        </h2>
        <ul className="mt-2 list-disc pl-5">
          {me.roles.map((role) => (
            <li key={role}>{roleLabel(role)}</li>
          ))}
        </ul>
      </section>
      <PipelineCard />
    </div>
  );
}
