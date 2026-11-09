import type { LeadDto } from '@autonova/contracts';
import { LeadStage } from '@autonova/enums';
import Link from 'next/link';

/**
 * What is still missing on a lead, worked out from the lead itself so it never goes stale and disappears
 * once the lead is set up. A suggestion, not a gate: an individual prospect is a valid lead.
 */
export function leadNextSteps(lead: LeadDto): { key: string; text: string; href: string }[] {
  const open = lead.stage !== LeadStage.Won && lead.stage !== LeadStage.Lost;
  if (!open) return [];
  const steps: { key: string; text: string; href: string }[] = [];
  if (!lead.company) {
    steps.push({
      key: 'company',
      text: 'Link or create the company, so its contacts and deals are kept together.',
      href: '#relationships-heading',
    });
  } else if (!lead.primaryContact) {
    steps.push({
      key: 'contact',
      text: `Add or choose who you are dealing with at ${lead.company.name}.`,
      href: '#relationships-heading',
    });
  }
  if (!lead.nextActionAt) {
    steps.push({
      key: 'follow-up',
      text: 'Set a next action and follow-up date so a reminder is sent.',
      href: `/leads/${lead.id}/edit`,
    });
  }
  return steps;
}

export function LeadNextSteps({ lead }: { lead: LeadDto }) {
  const steps = leadNextSteps(lead);
  if (steps.length === 0) return null;
  return (
    <section
      className="mt-6 rounded-lg border border-primary/30 bg-canvas p-4"
      aria-labelledby="next-steps-heading"
    >
      <h2 id="next-steps-heading" className="text-sm font-semibold text-navy">
        Next steps for this lead
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {steps.map((step) => (
          <li key={step.key}>
            <Link className="text-primary underline" href={step.href}>
              {step.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
