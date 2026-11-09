import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadAppConfig } from './config/app-config.js';

async function bootstrap() {
  const config = loadAppConfig();
  const app = await NestFactory.create(AppModule);

  // Trust forwarded client IP headers only from explicitly allowlisted ingress hops.
  // Never use trust proxy=true or a world-wide CIDR: clients could spoof X-Forwarded-For.
  if (config.trustedProxyCidrs.length > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', config.trustedProxyCidrs);
  }

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configuredOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const localOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];

  const allowedOrigins = Array.from(
    new Set([
      ...configuredOrigins,
      ...(process.env.NODE_ENV !== 'production' ? localOrigins : []),
    ]),
  );

  app.enableCors({
    credentials: true,
    origin: allowedOrigins,
  });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    'Application failed to start',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
