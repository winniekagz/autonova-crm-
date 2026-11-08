import { CompanyDetail } from '@/features/companies/company-detail';

export default async function CompanyPage({ params }: PageProps<'/companies/[id]'>) {
  const { id } = await params;
  return <CompanyDetail id={id} />;
}
