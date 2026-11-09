// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeLead } from './lead-test-fixtures';
import { LeadStageTracker } from './lead-stage-tracker';

describe('LeadStageTracker', () => {
  it('marks earlier stages done and the current one as the current step', () => {
    render(<LeadStageTracker lead={makeLead({ stage: 'QUALIFIED' })} />);
    const steps = screen.getAllByRole('listitem');
    expect(steps[0]).toHaveTextContent('(completed)');
    expect(steps[1]).toHaveTextContent('(completed)');
    expect(steps[2]).toHaveAttribute('aria-current', 'step');
    expect(steps[3]).not.toHaveTextContent('(completed)');
  });

  it('says why a lost lead left the pipeline', () => {
    render(
      <LeadStageTracker lead={makeLead({ stage: 'LOST', lostReason: 'Chose a competitor' })} />,
    );
    expect(screen.getByText(/This lead is Lost: Chose a competitor/)).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { current: 'step' })).toBeNull();
  });

  it('shows the revisit date of a disqualified lead', () => {
    render(
      <LeadStageTracker
        lead={makeLead({
          stage: 'DISQUALIFIED',
          disqualificationReason: 'TIMING_REVISIT_LATER',
          revisitOn: '2027-01-15',
        })}
      />,
    );
    expect(
      screen.getByText(/Disqualified: Timing Revisit Later\. Returns to New Lead on 2027-01-15/),
    ).toBeInTheDocument();
  });
});
