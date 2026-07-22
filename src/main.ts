import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const isProduction = config.get<string>('env') === 'production';

  // Trust exactly N reverse-proxy hops (TRUST_PROXY_HOPS, default 1) so req.ip
  // resolves to the real client from X-Forwarded-For. Behind a single edge
  // (Render / one nginx) it's 1; behind chained proxies (on-prem public access
  // is DMZ nginx -> app nginx -> app) it's 2. A fixed count — never `true`,
  // which would trust client-supplied XFF and let attackers spoof the source IP.
  app.getHttpAdapter().getInstance().set('trust proxy', config.get<number>('trustProxyHops') ?? 1);

  // Security headers: HSTS, X-Content-Type-Options=nosniff, frameguard (anti
  // clickjacking), no X-Powered-By, referrer policy, etc. Resource policy is
  // cross-origin because the SPA (Vercel) and API (Render) are separate origins
  // in the managed deployment; on-prem they're same-origin via nginx.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // The API serves only JSON, never HTML, so a document CSP is unnecessary
      // and would only risk breaking future embedded docs/tooling.
      contentSecurityPolicy: false,
    }),
  );

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

  // Strict origin allow-list from FRONTEND_ORIGIN (comma-separated). In
  // production ONLY these exact origins are accepted. Outside production we also
  // allow *.vercel.app so preview deployments work — never in prod, where a
  // wildcard would let any attacker-controlled *.vercel.app site make
  // credentialed cross-origin calls.
  const allowed = config
    .getOrThrow<string>('frontendOrigin')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      // Non-browser clients (curl, server-to-server) send no Origin — allowed.
      if (!origin) return cb(null, true);
      let allow = allowed.includes(origin);
      if (!allow && !isProduction) {
        try {
          allow = /\.vercel\.app$/.test(new URL(origin).hostname);
        } catch {
          allow = false; // malformed Origin header
        }
      }
      cb(null, allow);
    },
    credentials: true,
  });

  const port = config.getOrThrow<number>('port');
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Zemen Director Portal API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
