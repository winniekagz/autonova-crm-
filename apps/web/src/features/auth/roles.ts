/** Display names for the system roles. The set of roles itself comes from the API. */
export const ROLE_LABEL: Record<string, string> = {
  director: 'Director / Administrator',
  business_development: 'Business Development',
  technical_lead: 'Technical Lead',
  finance: 'Finance',
};

export const roleLabel = (key: string): string => ROLE_LABEL[key] ?? key;
