import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createValidationPipe, toDetails } from './validation.pipe.js';

const schema = z.object({ email: z.email(), age: z.number().int() });

describe('validation pipe', () => {
  const pipe = createValidationPipe();
  const meta = (data?: string) => ({ type: 'body' as const, data, schema });

  it('passes valid input through', async () => {
    await expect(pipe.transform({ email: 'a@b.co', age: 3 }, meta())).resolves.toEqual({
      email: 'a@b.co',
      age: 3,
    });
  });

  it('rejects invalid input with field-level details', async () => {
    const err = await pipe.transform({ email: 'x', age: 1.5 }, meta()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as {
      code: string;
      details: { path: string }[];
    };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details.map((d) => d.path).sort()).toEqual(['age', 'email']);
  });

  it('formats nested paths', () => {
    expect(toDetails([{ message: 'm', path: ['a', 0, { key: 'b' }] }])).toEqual([
      { path: 'a.0.b', message: 'm' },
    ]);
  });
});
