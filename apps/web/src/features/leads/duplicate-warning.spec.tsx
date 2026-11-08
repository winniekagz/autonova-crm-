// @vitest-environment jsdom
import type { LeadDuplicateCheckResult } from '@autonova/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DuplicateWarning } from './duplicate-warning';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const result: LeadDuplicateCheckResult = {
  candidates: [
    {
      id: 'l-7',
      name: 'Achieng Otieno',
      companyName: 'Otieno Logistics',
      phone: '0712 345 678',
      stage: 'VISITS_AND_CALLS',
      ownerName: 'Sam',
      matchedOn: ['PHONE'],
      createdAt: '2026-11-01T08:00:00.000Z',
    },
  ],
  hiddenMatchCount: 0,
};

const props = {
  checking: false,
  failed: false,
  result: undefined,
  confirmationRequired: false,
  acknowledged: false,
  onAcknowledgedChange: vi.fn(),
};

describe('DuplicateWarning', () => {
  it('renders nothing when there is nothing to warn about', () => {
    const { container } = render(
      <DuplicateWarning {...props} result={{ candidates: [], hiddenMatchCount: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the checking state', () => {
    render(<DuplicateWarning {...props} checking />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking for duplicates');
  });

  it('lists the existing record with a link, owner, stage and why it matched', () => {
    render(<DuplicateWarning {...props} result={result} />);
    expect(screen.getByRole('link', { name: 'Achieng Otieno' })).toHaveAttribute(
      'href',
      '/leads/l-7',
    );
    expect(
      screen.getByText(/Visits And Calls · Owner Sam · Added 1 Nov 2026 · same phone/),
    ).toBeInTheDocument();
  });

  it('asks for confirmation and reports the choice', async () => {
    const onAcknowledgedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DuplicateWarning {...props} result={result} onAcknowledgedChange={onAcknowledgedChange} />,
    );
    await user.click(
      screen.getByRole('checkbox', { name: /reviewed this and want to save the lead anyway/ }),
    );
    expect(onAcknowledgedChange).toHaveBeenCalledWith(true);
  });

  it('counts matches in other pipelines without describing them', () => {
    render(<DuplicateWarning {...props} result={{ candidates: [], hiddenMatchCount: 2 }} />);
    expect(
      screen.getByText(/2 more matching leads are in another person's pipeline/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('still asks for confirmation when the server required it but the panel found nothing', () => {
    render(<DuplicateWarning {...props} confirmationRequired />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('tells the user the check failed without blocking the save', () => {
    render(<DuplicateWarning {...props} failed />);
    expect(screen.getByRole('status')).toHaveTextContent('could not check for duplicates');
  });
});
