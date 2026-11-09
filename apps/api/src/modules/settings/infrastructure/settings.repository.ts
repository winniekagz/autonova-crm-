import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

type Db = Prisma.TransactionClient;

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async read(key: string, db: Db | PrismaService = this.prisma): Promise<unknown> {
    const row = await db.systemSetting.findUnique({ where: { key } });
    return row ? row.value : undefined;
  }

  write(db: Db, key: string, value: Prisma.InputJsonValue, userId: string) {
    return db.systemSetting.upsert({
      where: { key },
      create: { key, value, updatedByUserId: userId },
      update: { value, updatedByUserId: userId },
    });
  }
}
