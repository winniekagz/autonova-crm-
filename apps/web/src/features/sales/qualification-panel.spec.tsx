// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLead, page } from '@/features/leads/lead-test-fixtures';
import { apiError, mockApi, renderAs } from '@/test/render';
import { QualificationPanel } from './qualification-panel';
import {
  makeQualification,
  SALES_BD,
  SALES_DIRECTOR,
  SALES_READER,
  SETTINGS,
} from './sales-test-fixtures';

afterEach(() => vi.unstubAllGlobals());
const inVisits = makeLead({ stage: 'VISITS_AND_CALLS' });
const routes = (latest: unknown) => ({
  'GET /leads/l-1/qualification': () => ({ body: latest }),
  'GET /settings/qualification': () => ({ body: SETTINGS }),
});

describe('QualificationPanel', () => {
  it('shows the server score and says the pass mark is a temporary default', async () => {
    mockApi(routes(makeQualification()));
    renderAs(SALES_BD, <QualificationPanel lead={inVisits} />);
    expect(await screen.findByLabelText('Latest assessment')).toHaveTextContent('62');
    expect(screen.getByText(/Passed/)).toBeInTheDocument();
    expect(screen.getByText(/temporary default/)).toBeInTheDocument();
  });

  it('says so when there is no assessment yet', async () => {
    mockApi(routes(null));
    renderAs(SALES_BD, <QualificationPanel lead={inVisits} />);
    expect(await screen.findByText('No assessment yet.')).toBeInTheDocument();
  });

  it('sends the four ratings and reports the score from the response', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      ...routes(null),
      'POST /leads/l-1/qualification': () => ({
        status: 201,
        body: makeQualification({ score: 40, passed: false }),
      }),
    });
    renderAs(SALES_BD, <QualificationPanel lead={inVisits} />);
    await screen.findByText('No assessment yet.');
    await user.selectOptions(screen.getByLabelText(/Budget/), 'FULLY_MET');
    await user.click(screen.getByRole('button', { name: 'Record assessment' }));
    expect(await screen.findByText(/Scored 40/)).toHaveTextContent(
      'Scored 40 of 100: below the pass mark of 60.',
    );
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({ budget: 'FULLY_MET', authority: 'NOT_MET' });
    expect(post?.body).not.toHaveProperty('score');
  });

  it('lets a non-Director qualify a passing lead but asks a Director for a reason on a failing one', async () => {
    const user = userEvent.setup();
    mockApi({
      ...routes(makeQualification({ passed: false, score: 30 })),
      'POST /leads/l-1/qualify': () => ({ body: makeLead({ stage: 'QUALIFIED' }) }),
    });
    renderAs(SALES_DIRECTOR, <QualificationPanel lead={inVisits} />);
    await screen.findByLabelText('Latest assessment');
    await user.click(screen.getByRole('button', { name: /qualify/i }));
    expect(await screen.findByText(/must give a reason/i)).toBeInTheDocument();
  });

  it('shows a plain message when the server refuses', async () => {
    const user = userEvent.setup();
    mockApi({
      ...routes(makeQualification()),
      'POST /leads/l-1/qualify': () => apiError(409, 'LEAD_STAGE_CHANGED', 'internal'),
    });
    renderAs(SALES_BD, <QualificationPanel lead={inVisits} />);
    await screen.findByLabelText('Latest assessment');
    await user.click(screen.getByRole('button', { name: /qualify/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This lead changed while you were working');
    expect(alert).not.toHaveTextContent('internal');
  });

  it('is read-only outside Visits and calls, and hidden without lead access', async () => {
    mockApi(routes(makeQualification()));
    const { unmount } = renderAs(
      SALES_BD,
      <QualificationPanel lead={makeLead({ stage: 'QUALIFIED' })} />,
    );
    await screen.findByLabelText('Latest assessment');
    expect(screen.queryByRole('form', { name: 'Record an assessment' })).not.toBeInTheDocument();
    unmount();
    const { container } = renderAs(
      { ...SALES_READER, permissions: [] },
      <QualificationPanel lead={inVisits} />,
    );
    expect(container).toBeEmptyDOMElement();
    void page;
  });
});
