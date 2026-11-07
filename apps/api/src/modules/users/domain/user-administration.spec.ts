import { describe, expect, it } from 'vitest';
import {
  checkDisable,
  checkRoleChange,
  isActiveDirector,
  normalizeRoles,
  type TargetState,
} from './user-administration.js';

const ACTOR = 'actor';
const TARGET = 'target';
const activeDirector: TargetState = { id: TARGET, status: 'ACTIVE', roles: ['director'] };
const activeFinance: TargetState = { id: TARGET, status: 'ACTIVE', roles: ['finance'] };

describe('normalizeRoles', () => {
  it('sorts and de-duplicates', () => {
    expect(normalizeRoles(['finance', 'director', 'finance'])).toEqual(['director', 'finance']);
  });
});

describe('isActiveDirector', () => {
  it('requires both the role and ACTIVE status', () => {
    expect(isActiveDirector(activeDirector)).toBe(true);
    expect(isActiveDirector({ status: 'INVITED', roles: ['director'] })).toBe(false);
    expect(isActiveDirector({ status: 'DISABLED', roles: ['director'] })).toBe(false);
    expect(isActiveDirector(activeFinance)).toBe(false);
  });
});

describe('checkRoleChange', () => {
  const change = (over: Partial<Parameters<typeof checkRoleChange>[0]>) =>
    checkRoleChange({
      actorId: ACTOR,
      target: activeFinance,
      nextRoles: ['business_development'],
      otherActiveDirectors: 1,
      ...over,
    });

  it('allows an ordinary change by another Director', () => {
    expect(change({})).toEqual({ ok: true });
  });

  it('refuses any change to the actor’s own roles, up or down', () => {
    expect(change({ target: { ...activeFinance, id: ACTOR }, nextRoles: ['director'] })).toEqual({
      ok: false,
      violation: 'SELF_ROLE_CHANGE_FORBIDDEN',
    });
    expect(change({ target: { ...activeDirector, id: ACTOR }, nextRoles: ['finance'] })).toEqual({
      ok: false,
      violation: 'SELF_ROLE_CHANGE_FORBIDDEN',
    });
  });

  it('refuses an empty role set', () => {
    expect(change({ nextRoles: [] })).toEqual({ ok: false, violation: 'NO_ROLES' });
  });

  it('refuses to remove Director from the last active Director', () => {
    expect(
      change({ target: activeDirector, nextRoles: ['finance'], otherActiveDirectors: 0 }),
    ).toEqual({ ok: false, violation: 'LAST_DIRECTOR' });
  });

  it('allows removing Director when another active Director remains', () => {
    expect(
      change({ target: activeDirector, nextRoles: ['finance'], otherActiveDirectors: 1 }),
    ).toEqual({ ok: true });
  });

  it('allows keeping Director alongside other roles even if last', () => {
    expect(
      change({
        target: activeDirector,
        nextRoles: ['director', 'technical_lead'],
        otherActiveDirectors: 0,
      }),
    ).toEqual({ ok: true });
  });

  it('does not count an INVITED or DISABLED Director as protected', () => {
    const invited: TargetState = { id: TARGET, status: 'INVITED', roles: ['director'] };
    expect(change({ target: invited, nextRoles: ['finance'], otherActiveDirectors: 0 })).toEqual({
      ok: true,
    });
  });
});

describe('checkDisable', () => {
  const disable = (over: Partial<Parameters<typeof checkDisable>[0]>) =>
    checkDisable({ actorId: ACTOR, target: activeFinance, otherActiveDirectors: 1, ...over });

  it('allows disabling an active user and cancelling an invitation', () => {
    expect(disable({})).toEqual({ ok: true });
    expect(disable({ target: { ...activeFinance, status: 'INVITED' } })).toEqual({ ok: true });
  });

  it('refuses self-disable', () => {
    expect(disable({ target: { ...activeFinance, id: ACTOR } })).toEqual({
      ok: false,
      violation: 'SELF_DISABLE_FORBIDDEN',
    });
  });

  it('refuses disabling an already disabled user', () => {
    expect(disable({ target: { ...activeFinance, status: 'DISABLED' } })).toEqual({
      ok: false,
      violation: 'USER_ALREADY_DISABLED',
    });
  });

  it('refuses disabling the last active Director, allows it when another remains', () => {
    expect(disable({ target: activeDirector, otherActiveDirectors: 0 })).toEqual({
      ok: false,
      violation: 'LAST_DIRECTOR',
    });
    expect(disable({ target: activeDirector, otherActiveDirectors: 1 })).toEqual({ ok: true });
  });
});
