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
  security: {
    /** IPs that are always allowed to sign in, exempt from the admin IP
     *  blocklist — set to your admin workstation(s)/subnet so a mistaken block
     *  can't lock out the people who'd need to clear it. */
    ipAllowlist: string[];
  };
}

const bool = (v: string | undefined, fallback = false): boolean =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Read a mandatory, security-sensitive value from the environment. There is
 * deliberately NO in-code fallback for these (JWT secrets, DB URL, storage
 * credentials) — a predictable default in source could ship to a misconfigured
 * production deployment (pentest 2.2.3.3). Missing/empty => fail fast at boot,
 * in every environment. Set them in `.env` (see .env.example).
 */
const requireEnv = (name: string): string => {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required configuration "${name}" — set it in the environment (.env / deployment env).`);
  }
  return v;
};

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

/** The specific known-insecure values this app can boot with by accident: the
 *  in-code dev fallbacks and the placeholders shipped in the *.env.example
 *  files. Narrowly targeted (not broad words like "secret"/"password") so a
 *  legitimately-random operator secret is never rejected by coincidence. */
const INSECURE_SECRET_MARKERS = [
  'change-me',
  'changeme',
  'replace_me',
  'dev-access-secret',
  'dev-refresh-secret',
  'zemen-secret',
];

const looksInsecure = (value: string | undefined): boolean => {
  // Reject only: unset, too short to be a real secret, or a recognised
  // default/placeholder. A strong random value (e.g. `openssl rand -hex 32`)
  // always passes.
  if (!value || value.length < 16) return true;
  const lower = value.toLowerCase();
  return INSECURE_SECRET_MARKERS.some((m) => lower.includes(m));
};

/**
 * Fail-fast boot guard. A production instance that starts with a default,
 * placeholder, missing, too-short, or reused secret is trivially forgeable
 * (JWTs) or accessible (storage) — refuse to start rather than run insecure.
 */
function assertProductionSecrets(cfg: AppConfig): void {
  if (!isProduction) return;
  const problems: string[] = [];
  if (looksInsecure(process.env.JWT_ACCESS_SECRET)) {
    problems.push('JWT_ACCESS_SECRET is unset, too short (<16), or a known/placeholder value');
  }
  if (looksInsecure(process.env.JWT_REFRESH_SECRET)) {
    problems.push('JWT_REFRESH_SECRET is unset, too short (<16), or a known/placeholder value');
  }
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  if (looksInsecure(process.env.S3_SECRET_KEY)) {
    problems.push('S3_SECRET_KEY is unset, too short, or a known/placeholder value');
  }
  if (cfg.otp.devMode) {
    problems.push('OTP_DEV_MODE must never be enabled in production (it echoes verification codes in API responses)');
  }
  if (problems.length) {
    throw new Error(
      `Refusing to start: insecure production configuration:\n  - ${problems.join('\n  - ')}\n` +
        'Set strong, unique secrets (e.g. `openssl rand -hex 32`) in the environment.',
    );
  }
}

const buildConfig = (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  database: {
    // Required — no in-code default (contains DB credentials).
    url: requireEnv('DATABASE_URL'),
    synchronize: bool(process.env.DB_SYNCHRONIZE, true),
    logging: bool(process.env.DB_LOGGING, false),
    // Managed Postgres (Render/Neon/Supabase) requires TLS.
    ssl: bool(process.env.DB_SSL, false),
  },
  jwt: {
    // Signing secrets are required — never a predictable in-code fallback.
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    challengeSecret: `${requireEnv('JWT_ACCESS_SECRET')}::login-challenge`,
  },
  otp: {
    ttlMinutes: int(process.env.OTP_TTL_MINUTES, 10),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
    length: int(process.env.OTP_LENGTH, 6),
    // Never honour dev-mode (which returns the OTP in the API response) in
    // production, regardless of what the env says — an unverified email is the
    // whole point of the OTP, and echoing it back defeats account ownership.
    devMode: isProduction ? false : bool(process.env.OTP_DEV_MODE, false),
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
    // Storage credentials are required — no predictable in-code fallback.
    accessKey: requireEnv('S3_ACCESS_KEY'),
    secretKey: requireEnv('S3_SECRET_KEY'),
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
  security: {
    ipAllowlist: (process.env.SECURITY_IP_ALLOWLIST ?? '127.0.0.1,::1')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
});

export default (): AppConfig => {
  const cfg = buildConfig();
  assertProductionSecrets(cfg);
  return cfg;
};
