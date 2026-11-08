import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { applyServerFieldErrors } from './form-errors';

type Values = { email: string; fullName: string };
const fields = ['email', 'fullName'] as const;
const validation = (details: { path: string; message: string }[]) =>
  new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed', details);

describe('applyServerFieldErrors', () => {
  it('shows each known field problem on its field', () => {
    const setError = vi.fn();
    const applied = applyServerFieldErrors<Values>(
      validation([
        { path: 'email', message: 'Invalid email' },
        { path: 'fullName', message: 'Too long' },
      ]),
      setError,
      fields,
    );
    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Invalid email' });
    expect(setError).toHaveBeenCalledWith('fullName', { type: 'server', message: 'Too long' });
  });

  it.each(['__proto__', 'constructor', 'roles', 'email.nested', '', 'EMAIL', 'toString'])(
    'ignores a field the form does not own (%j)',
    (path) => {
      const setError = vi.fn();
      const applied = applyServerFieldErrors<Values>(
        validation([{ path, message: 'x' }]),
        setError,
        fields,
      );
      expect(applied).toBe(false);
      expect(setError).not.toHaveBeenCalled();
    },
  );

  it('keeps the known problems when unknown ones are mixed in', () => {
    const setError = vi.fn();
    const applied = applyServerFieldErrors<Values>(
      validation([
        { path: 'nope', message: 'a' },
        { path: 'email', message: 'b' },
      ]),
      setError,
      fields,
    );
    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
  });

  it('does nothing for errors that carry no field details or are not API errors', () => {
    const setError = vi.fn();
    expect(applyServerFieldErrors<Values>(new ApiError(500, 'X', 'm'), setError, fields)).toBe(
      false,
    );
    expect(applyServerFieldErrors<Values>(new Error('boom'), setError, fields)).toBe(false);
    expect(applyServerFieldErrors<Values>('boom', setError, fields)).toBe(false);
    expect(applyServerFieldErrors<Values>(undefined, setError, fields)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
