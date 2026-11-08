import { EditCompany } from '@/features/companies/company-form';

export default async function EditCompanyPage({ params }: PageProps<'/companies/[id]/edit'>) {
  const { id } = await params;
  return <EditCompany id={id} />;
}
