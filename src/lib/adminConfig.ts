import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export type AdminConfig = {
  geminiApiKey?: string;
  geminiLastValidatedAt?: string;
  geminiTokenLimit?: number;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  supabaseLastSavedAt?: string;
  migrationLastRunAt?: string;
  migrationMessage?: string;
};

function getConfigFilePath() {
  if (process.env.ADMIN_CONFIG_PATH) {
    return process.env.ADMIN_CONFIG_PATH;
  }

  if (process.env.VERCEL || process.env.NEXT_RUNTIME) {
    return path.join(os.tmpdir(), 'verde-admin-config.json');
  }

  return path.join(process.cwd(), 'data', 'admin-config.json');
}

const CONFIG_PATH = getConfigFilePath();

function getEnvConfig() {
  const parsedTokenLimit = Number(process.env.GEMINI_TOKEN_LIMIT || 0);

  return {
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiTokenLimit: Number.isFinite(parsedTokenLimit) && parsedTokenLimit > 0 ? parsedTokenLimit : undefined,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };
}

async function ensureConfigFile() {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });

  try {
    await fs.access(CONFIG_PATH);
  } catch {
    await fs.writeFile(CONFIG_PATH, JSON.stringify({}, null, 2), 'utf8');
  }
}

async function readConfig(): Promise<AdminConfig> {
  await ensureConfigFile();
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');

  try {
    return JSON.parse(raw) as AdminConfig;
  } catch {
    return {};
  }
}

async function writeConfig(nextConfig: AdminConfig) {
  await ensureConfigFile();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(nextConfig, null, 2), 'utf8');
}

function maskSecret(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function normalizeTokenLimit(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('The Gemini token quota must be a positive number.');
  }

  return Math.floor(parsed);
}

async function validateGeminiKey(apiKey: string) {
  const models = ['gemini-3.1-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }],
          }),
        }
      );

      if (response.ok) {
        return { ok: true, model };
      }

      const text = await response.text().catch(() => '');
      lastError = new Error(text || `The Gemini API rejected the key for ${model}.`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('The Gemini API could not be reached.');
    }
  }

  throw lastError ?? new Error('The Gemini API rejected the key.');
}

export async function getResolvedGeminiApiKey() {
  const envConfig = getEnvConfig();
  const config = await readConfig();
  return envConfig.geminiApiKey || config.geminiApiKey || '';
}

export async function getGeminiKeyStatus() {
  const envConfig = getEnvConfig();
  const config = await readConfig();
  const merged = {
    geminiApiKey: envConfig.geminiApiKey || config.geminiApiKey || '',
    geminiLastValidatedAt: config.geminiLastValidatedAt,
    geminiTokenLimit: envConfig.geminiTokenLimit ?? config.geminiTokenLimit,
  };

  if (!merged.geminiApiKey) {
    return { configured: false, maskedKey: null as string | null, lastValidatedAt: null as string | null, tokenLimit: null as number | null };
  }

  return {
    configured: true,
    maskedKey: maskSecret(merged.geminiApiKey),
    lastValidatedAt: merged.geminiLastValidatedAt ?? null,
    tokenLimit: merged.geminiTokenLimit ?? null,
  };
}

export async function saveGeminiApiKey(apiKey: string, tokenLimit?: string | number) {
  let validationMessage: string | null = null;

  try {
    await validateGeminiKey(apiKey);
  } catch (error) {
    validationMessage = error instanceof Error ? error.message : 'The Gemini API could not be validated.';
  }

  const config = await readConfig();
  const normalizedLimit = normalizeTokenLimit(tokenLimit);
  config.geminiApiKey = apiKey;
  config.geminiLastValidatedAt = new Date().toISOString();
  if (normalizedLimit !== undefined) {
    config.geminiTokenLimit = normalizedLimit;
    process.env.GEMINI_TOKEN_LIMIT = String(normalizedLimit);
  }
  process.env.GEMINI_API_KEY = apiKey;
  await writeConfig(config);

  return {
    configured: true,
    maskedKey: maskSecret(apiKey),
    lastValidatedAt: config.geminiLastValidatedAt,
    tokenLimit: config.geminiTokenLimit ?? null,
    validationMessage,
  };
}

export async function saveSupabaseConfig(values: {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
}) {
  const config = await readConfig();
  config.supabaseUrl = values.supabaseUrl;
  config.supabasePublishableKey = values.supabasePublishableKey;
  config.supabaseSecretKey = values.supabaseSecretKey;
  config.supabaseLastSavedAt = new Date().toISOString();
  process.env.NEXT_PUBLIC_SUPABASE_URL = values.supabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = values.supabasePublishableKey;
  process.env.SUPABASE_SECRET_KEY = values.supabaseSecretKey;
  await writeConfig(config);

  return {
    configured: Boolean(values.supabaseUrl && values.supabasePublishableKey && values.supabaseSecretKey),
    maskedPublishableKey: maskSecret(values.supabasePublishableKey),
    maskedSecretKey: maskSecret(values.supabaseSecretKey),
    lastSavedAt: config.supabaseLastSavedAt,
  };
}

export async function getSupabaseConfigStatus() {
  const envConfig = getEnvConfig();
  const config = await readConfig();
  const merged = {
    supabaseUrl: envConfig.supabaseUrl || config.supabaseUrl || '',
    supabasePublishableKey: envConfig.supabasePublishableKey || config.supabasePublishableKey || '',
    supabaseSecretKey: envConfig.supabaseSecretKey || config.supabaseSecretKey || '',
    supabaseLastSavedAt: config.supabaseLastSavedAt,
  };

  return {
    configured: Boolean(merged.supabaseUrl && merged.supabasePublishableKey && merged.supabaseSecretKey),
    supabaseUrl: merged.supabaseUrl || null,
    maskedPublishableKey: maskSecret(merged.supabasePublishableKey),
    maskedSecretKey: maskSecret(merged.supabaseSecretKey),
    lastSavedAt: merged.supabaseLastSavedAt ?? null,
  };
}

export async function recordMigrationRun() {
  const config = await readConfig();
  config.migrationLastRunAt = new Date().toISOString();
  config.migrationMessage = 'Migration checklist completed. Review the Supabase SQL and run it when you are ready to create the supporting tables.';
  await writeConfig(config);
  return {
    lastRunAt: config.migrationLastRunAt,
    message: config.migrationMessage,
  };
}

export async function getSystemStatus() {
  const envConfig = getEnvConfig();
  const config = await readConfig();
  return {
    geminiConfigured: Boolean(envConfig.geminiApiKey || config.geminiApiKey),
    geminiTokenLimit: envConfig.geminiTokenLimit ?? config.geminiTokenLimit ?? null,
    supabaseConfigured: Boolean((envConfig.supabaseUrl || config.supabaseUrl) && (envConfig.supabasePublishableKey || config.supabasePublishableKey) && (envConfig.supabaseSecretKey || config.supabaseSecretKey)),
    migrationLastRunAt: config.migrationLastRunAt ?? null,
    checkedAt: new Date().toISOString(),
  };
}
