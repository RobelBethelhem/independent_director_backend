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
  };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  otp: {
    ttlMinutes: number;
    maxAttempts: number;
    length: number;
  };
  storage: {
    endpoint: string;
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
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  otp: {
    ttlMinutes: int(process.env.OTP_TTL_MINUTES, 10),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    length: int(process.env.OTP_LENGTH, 4),
  },
  storage: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
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
});
