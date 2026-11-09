'use client';

import type { LeadDto } from '@autonova/contracts';
import { Drawer } from '@/components/ui/drawer';
import { LeadForm } from './lead-form';

/** Right-hand drawer that collects a new lead without leaving the table. */
export function NewLeadDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (lead: LeadDto) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New lead"
      description="Capture the prospect now; add more detail on the lead page."
    >
      <LeadForm onCancel={onClose} onSaved={onCreated} />
    </Drawer>
  );
}
