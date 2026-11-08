import { Suspense } from 'react';
import { LeadsList } from '@/features/leads/leads-list';

// The list reads its search and page from the URL, which a statically built page cannot know.
export default function LeadsPage() {
  return (
    <Suspense fallback={<p role="status">Loading leads…</p>}>
      <LeadsList />
    </Suspense>
  );
}
