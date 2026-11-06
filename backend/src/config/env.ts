import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file: check backend/.env first, then monorepo root .env, then cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // fallback to current working directory

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number between 1 and 65535',
    }),
  MONGODB_URI: z
    .string({ required_error: 'MONGODB_URI is required' })
    .min(1, 'MONGODB_URI is required')
    .refine(
      (val) => val.startsWith('mongodb://') || val.startsWith('mongodb+srv://'),
      {
        message: 'Invalid MONGODB_URI: URI must start with "mongodb://" or "mongodb+srv://"',
      },
    )
    .default('mongodb://localhost:27017/moneylens'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('moneylens-development-jwt-secret-minimum-32-chars-long'),
  JWT_EXPIRY: z.string().default('7d'),
  COOKIE_NAME: z.string().default('moneylens_token'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  INTERNAL_API_KEY: z
    .string()
    .min(16, 'INTERNAL_API_KEY must be at least 16 characters')
    .default('moneylens-internal-secret-key-32-chars-dev'),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
}).refine(
  (data) => {
    if (data.NODE_ENV === 'production') {
      return (
        data.JWT_SECRET !== 'moneylens-development-jwt-secret-minimum-32-chars-long' &&
        data.INTERNAL_API_KEY !== 'moneylens-internal-secret-key-32-chars-dev'
      );
    }
    return true;
  },
  {
    message:
      'In production mode (NODE_ENV=production), JWT_SECRET and INTERNAL_API_KEY must be set to custom production secrets and cannot use default development keys.',
  },
);

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Fail fast with structured output on invalid config, NEVER leaking raw input values or secrets
    console.error('❌ FATAL: Invalid backend environment configuration:');
    result.error.issues.forEach((issue) => {
      const field = issue.path.join('.') || 'configuration';
      console.error(`  - [${field}]: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
