import { PrismaPg } from '@prisma/adapter-pg';
import { SystemRoleKey } from '@autonova/enums';
import {
  PERMISSION_DESCRIPTIONS,
  ROLE_PERMISSIONS,
} from '../src/modules/auth/domain/role-permissions.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // rely on real environment variables
}

/**
 * Seeds the four system roles from PRD 2.1. Idempotent: safe to run repeatedly.
 *
 * Also seeds the approved permissions and role→permission grants from `ROLE_PERMISSIONS` and makes
 * the database match it EXACTLY for system roles: grants that are no longer in the mapping are
 * removed, so tightening the mapping in code takes effect on the next seed.
 *
 * Deliberately NOT seeded:
 *  - permissions for matrix rows still marked "Confirm" (docs/06): they need stakeholder approval.
 *  - any user account: the first Director is created with the bootstrap CLI (no default credentials).
 */
const ROLES = [
  {
    key: SystemRoleKey.Director,
    name: 'Director / Administrator',
    description: 'Full system access, approvals and administrative oversight.',
  },
  {
    key: SystemRoleKey.BusinessDevelopment,
    name: 'Business Development',
    description: 'Manages own leads, visits, qualification, and drafts ToRs and quotations.',
  },
  {
    key: SystemRoleKey.TechnicalLead,
    name: 'Technical Lead',
    description: 'Reviews and estimates scope, marks feasibility, logs milestones and tickets.',
  },
  {
    key: SystemRoleKey.Finance,
    name: 'Finance',
    description: 'Raises invoices and records payments. Cannot edit scope.',
  },
] as const;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description },
      create: { ...role, isSystem: true },
    });
  }

  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  for (const [roleKey, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...permissionKeys] } },
    });
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: permissions.map((p) => p.id) } },
      }),
      prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ]);
  }

  const roles = await prisma.role.count({ where: { isSystem: true } });
  const grants = await prisma.rolePermission.count();
  console.log(`Seed complete: ${roles} system roles, ${grants} permission grants.`);
} finally {
  await prisma.$disconnect();
}
