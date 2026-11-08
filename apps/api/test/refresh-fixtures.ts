import { createHash } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createUser, loginSession } from './helpers.js';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** A fresh user with one live session: what the browser would hold right after signing in. */
export async function startSession(app: NestExpressApplication, roles?: string[]) {
  const user = await createUser(app, roles ? { roles } : {});
  const session = await loginSession(app, user.email);
  return { user, ...session };
}
