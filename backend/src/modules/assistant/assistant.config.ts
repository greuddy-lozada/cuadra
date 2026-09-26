export interface AssistantRuntimeConfig {
  provider: 'openai-compatible';
  apiKey: string;
  baseUrl: string;
  model: string;
  dailyLimit: number;
}

export function readAssistantConfig(
  env: NodeJS.ProcessEnv = process.env,
): AssistantRuntimeConfig | null {
  const provider = (env.ASSISTANT_PROVIDER || 'openai-compatible').trim();
  if (provider !== 'openai-compatible') return null;

  const apiKey = env.ASSISTANT_API_KEY?.trim() ?? '';
  const baseUrl = env.ASSISTANT_BASE_URL?.trim() ?? '';
  const model = env.ASSISTANT_MODEL?.trim() ?? '';
  if (!apiKey || !baseUrl || !model) return null;

  const parsed = Number(env.ASSISTANT_DAILY_LIMIT ?? '40');
  const dailyLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : 40;

  return {
    provider: 'openai-compatible',
    apiKey,
    baseUrl,
    model,
    dailyLimit,
  };
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

export function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'invalid-host';
  }
}
