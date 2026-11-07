import { describe, expectTypeOf, it } from 'vitest';
import type { ApiErrorBody, CreateUserRequest, Paginated, UserDto } from './index.js';

describe('contracts', () => {
  it('keeps the error envelope shape stable', () => {
    expectTypeOf<ApiErrorBody>().toHaveProperty('requestId').toBeString();
    expectTypeOf<ApiErrorBody>().toHaveProperty('code').toBeString();
  });

  it('paginates generically', () => {
    expectTypeOf<Paginated<{ id: string }>['items']>().toEqualTypeOf<{ id: string }[]>();
  });

  it('does not let a client choose the status of a new user, and the user DTO has no credential fields', () => {
    expectTypeOf<CreateUserRequest>().not.toHaveProperty('status');
    expectTypeOf<UserDto>().not.toHaveProperty('passwordHash');
    expectTypeOf<UserDto['status']>().toEqualTypeOf<'INVITED' | 'ACTIVE' | 'DISABLED'>();
  });
});
