import { Suspense } from 'react';
import { CompaniesList } from '@/features/companies/companies-list';

// The list reads its search, filter and page from the URL, which a statically built page cannot know.
export default function CompaniesPage() {
  return (
    <Suspense fallback={<p role="status">Loading companies…</p>}>
      <CompaniesList />
    </Suspense>
  );
}
