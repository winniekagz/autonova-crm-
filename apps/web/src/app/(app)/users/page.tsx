import { Suspense } from 'react';
import { UserList } from '@/features/users/user-list';

// The list reads its search and page from the URL, which a statically built page cannot know.
export default function UsersPage() {
  return (
    <Suspense fallback={<p role="status">Loading users…</p>}>
      <UserList />
    </Suspense>
  );
}
