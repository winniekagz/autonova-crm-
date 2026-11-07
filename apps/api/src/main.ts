import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);
  const port = app.get<ConfigService<Env, true>>(ConfigService).get('API_PORT', { infer: true });
  await app.listen(port);
  app.get(Logger).log(`API listening on :${port} — docs at /api/docs`);
}

await bootstrap();
