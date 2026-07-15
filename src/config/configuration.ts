/**
 * Central typed configuration, loaded from environment variables.
 * Registered via `ConfigModule.forRoot({ load: [configuration] })`.
 */
export interface AppConfig {
  env: string;
  port: number;
  frontendOrigin: string;
  database: {
    url: string;
    synchronize: boolean;
    logging: boolean;
    ssl: boolean;
  };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
    /** Signs short-lived mid-login challenge tokens (2FA step, session-conflict
     *  confirm step) — deliberately a DIFFERENT secret from accessSecret, not
     *  just a different payload shape, so a challenge token can never pass
     *  JwtStrategy's signature check even if someone tries sending it as a
     *  Bearer token. No new env var: derived from accessSecret. */
    challengeSecret: string;
  };
  otp: {
    ttlMinutes: number;
    maxAttempts: number;
    length: number;
    /** Demo/test environments with no email: return the OTP in the API response. */
    devMode: boolean;
  };
  storage: {
    /** Internal endpoint — only ever called container-to-container (bucket
     *  setup, delete). Never handed to the browser. */
    endpoint: string;
    /** Endpoint baked into presigned URLs, which the BROWSER fetches directly
     *  — must be reachable from wherever the applicant/staff sit, not just
     *  from inside the Docker network. Defaults to frontendOrigin, since the
     *  on-prem nginx proxies the storage bucket path same-origin (see
     *  frontend/nginx.conf) — no separate port/firewall rule needed. */
    publicEndpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    tlsInsecure: boolean;
  };
  sms: {
    url: string;
    username: string;
    password: string;
    /** Sender ID / shortcode registered against this gateway account. */
    from: string;
  };
}

const bool = (v: string | undefined, fallback = false): boolean =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgres://zemen:zemen@localhost:5432/zemen_director_portal',
    synchronize: bool(process.env.DB_SYNCHRONIZE, true),
    logging: bool(process.env.DB_LOGGING, false),
    // Managed Postgres (Render/Neon/Supabase) requires TLS.
    ssl: bool(process.env.DB_SSL, false),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    challengeSecret: `${process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me'}::login-challenge`,
  },
  otp: {
    ttlMinutes: int(process.env.OTP_TTL_MINUTES, 10),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    length: int(process.env.OTP_LENGTH, 4),
    devMode: bool(process.env.OTP_DEV_MODE, false),
  },
  storage: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    // Defaults to the internal endpoint itself — correct as-is for local dev
    // (MinIO's port is published straight to the host) and for Render/S3/R2
    // (already a real public URL). Only the on-prem deployment needs this
    // set explicitly, since its S3_ENDPOINT is a Docker-internal hostname.
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'zemen-documents',
    accessKey: process.env.S3_ACCESS_KEY ?? 'zemen',
    secretKey: process.env.S3_SECRET_KEY ?? 'zemen-secret',
    forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true),
  },
  mail: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: int(process.env.SMTP_PORT, 1025),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Zemen Bank <no-reply@zemen.test>',
    // DEV ONLY: skip TLS cert verification (for networks that intercept TLS).
    tlsInsecure: bool(process.env.SMTP_TLS_INSECURE, false),
  },
  sms: {
    url: process.env.SMS_GATEWAY_URL ?? 'https://smsgateway.zemenbank.com/http-api/send',
    username: process.env.SMS_USERNAME ?? '',
    password: process.env.SMS_PASSWORD ?? '',
    from: process.env.SMS_FROM ?? '',
  },
});
