import { UserDetail } from '@/features/users/user-detail';

export default async function UserPage({ params }: PageProps<'/users/[id]'>) {
  const { id } = await params;
  return <UserDetail userId={id} />;
}
