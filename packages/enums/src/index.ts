/**
 * Shared domain enums. Each enum is a const object plus a derived union type so the
 * values are available at runtime (validation, UI options) and at compile time.
 *
 * Rule: an enum is added here only when it is persisted or exchanged over the API.
 * Persisted enum changes are data migrations, not code edits (see docs/04-database-design.md).
 */

/** Keys of the system roles seeded by the API. Roles themselves are database rows. */
export const SystemRoleKey = {
  Director: 'director',
  BusinessDevelopment: 'business_development',
  TechnicalLead: 'technical_lead',
  Finance: 'finance',
} as const;
export type SystemRoleKey = (typeof SystemRoleKey)[keyof typeof SystemRoleKey];

/**
 * Permission keys (`<resource>:<action>`, also enforced by a database CHECK). The mapping from
 * roles to permissions lives in the API (`role-permissions.ts`); the web app only reads the
 * current user's keys from `/auth/me` to decide what to show — the API enforces them.
 */
export const PermissionKey = {
  UsersList: 'users:list',
  UsersRead: 'users:read',
  UsersCreate: 'users:create',
  UsersUpdate: 'users:update',
  UsersAssignRoles: 'users:assign_roles',
  UsersDisable: 'users:disable',
  RolesList: 'roles:list',
} as const;
export type PermissionKey = (typeof PermissionKey)[keyof typeof PermissionKey];

export const UserStatus = {
  Invited: 'INVITED',
  Active: 'ACTIVE',
  Disabled: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const Currency = {
  KES: 'KES',
  USD: 'USD',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export function enumValues<T extends Record<string, string>>(e: T): [T[keyof T], ...T[keyof T][]] {
  return Object.values(e) as [T[keyof T], ...T[keyof T][]];
}
