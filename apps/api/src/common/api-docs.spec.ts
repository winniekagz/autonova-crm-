import { describe, expect, it } from 'vitest';
import { API_ERROR_ENVELOPE, privateErrors } from './api-docs.js';

describe('error documentation', () => {
  it('describes exactly the fields ApiExceptionFilter returns', () => {
    expect(Object.keys(API_ERROR_ENVELOPE.properties).sort()).toEqual(
      ['code', 'details', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
    );
    expect(API_ERROR_ENVELOPE.required).not.toContain('details');
  });

  it('documents the sign-in and permission failures of a private operation', () => {
    expect(privateErrors.map((error) => error.status)).toEqual([401, 403]);
  });
});
