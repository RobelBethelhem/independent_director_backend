import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Honour X-Forwarded-For (req.ip) when running behind a reverse proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Strip unknown props, reject extras, and coerce DTO types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Allow the configured origin(s) — comma-separated — plus Vercel preview URLs.
  const allowed = config
    .getOrThrow<string>('frontendOrigin')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });

  const port = config.getOrThrow<number>('port');
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Zemen Director Portal API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
