import { EditLead } from '@/features/leads/lead-form';

export default async function EditLeadPage({ params }: PageProps<'/leads/[id]/edit'>) {
  const { id } = await params;
  return <EditLead id={id} />;
}
