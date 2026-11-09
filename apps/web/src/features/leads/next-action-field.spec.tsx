// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NextActionField } from './next-action-field';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NextActionField value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('NextActionField', () => {
  it('offers the standard actions in a dropdown', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText(/Next action/), 'Site visit');
    expect(screen.getByTestId('value')).toHaveTextContent('Site visit');
    expect(screen.queryByLabelText('Describe the next action')).not.toBeInTheDocument();
  });

  it('"Other" reveals a text box for a custom action', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText(/Next action/), 'Other…');
    await user.type(screen.getByLabelText('Describe the next action'), 'Collect signed forms');
    expect(screen.getByTestId('value')).toHaveTextContent('Collect signed forms');
  });

  it('keeps a free-text action from an older lead visible and editable', () => {
    render(<Harness initial="Call back after Easter" />);
    expect(screen.getByLabelText('Describe the next action')).toHaveValue('Call back after Easter');
    expect(screen.getByLabelText(/Next action/)).toHaveValue('__other__');
  });
});
