import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file from root monorepo or local directory
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
    .string()
    .min(1, 'MONGODB_URI is required')
    .default('mongodb://localhost:27017/moneylens_dev'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('moneylens-development-jwt-secret-minimum-32-chars-long'),
  COOKIE_NAME: z.string().default('moneylens_token'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  INTERNAL_API_KEY: z
    .string()
    .min(16, 'INTERNAL_API_KEY must be at least 16 characters')
    .default('moneylens-internal-secret-key-32-chars-dev'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Fail fast with structured output on invalid config
    console.error('❌ FATAL: Invalid backend environment configuration:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
