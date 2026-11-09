// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeLead } from './lead-test-fixtures';
import { LeadNextSteps, leadNextSteps } from './lead-next-steps';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const linked = { id: 'co-1', name: 'Otieno Logistics', archived: false };
const contact = {
  id: 'ct-1',
  name: 'Achieng',
  jobTitle: null,
  phone: null,
  email: null,
  archived: false,
};

describe('lead next steps', () => {
  it('suggests a company and a follow-up for a bare lead', () => {
    const steps = leadNextSteps(makeLead({ company: null, nextActionAt: '' }));
    expect(steps.map((s) => s.key)).toEqual(['company', 'follow-up']);
  });

  it('asks for a contact once there is a company but nobody to talk to', () => {
    const steps = leadNextSteps(makeLead({ company: linked, primaryContact: null }));
    expect(steps.map((s) => s.key)).toEqual(['contact']);
  });

  it('shows nothing, and renders nothing, when the lead is set up or closed', () => {
    const ready = makeLead({ company: linked, primaryContact: contact });
    expect(leadNextSteps(ready)).toEqual([]);
    expect(leadNextSteps(makeLead({ stage: 'WON', company: null, nextActionAt: '' }))).toEqual([]);
    const { container } = render(<LeadNextSteps lead={ready} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links the follow-up step to the edit form and the others to the company section', () => {
    render(<LeadNextSteps lead={makeLead({ id: 'l-9', company: null, nextActionAt: '' })} />);
    expect(screen.getByRole('link', { name: /Link or create the company/ })).toHaveAttribute(
      'href',
      '#relationships-heading',
    );
    expect(screen.getByRole('link', { name: /Set a next action/ })).toHaveAttribute(
      'href',
      '/leads/l-9/edit',
    );
  });
});
