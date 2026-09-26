import { readAssistantConfig, chatCompletionsUrl } from './assistant.config';

describe('readAssistantConfig', () => {
  it('is off when the key or base URL is missing', () => {
    expect(readAssistantConfig({})).toBeNull();
    expect(
      readAssistantConfig({
        ASSISTANT_API_KEY: 'key',
        ASSISTANT_MODEL: 'm',
      }),
    ).toBeNull();
  });

  it('is off for an unknown provider', () => {
    expect(
      readAssistantConfig({
        ASSISTANT_PROVIDER: 'other',
        ASSISTANT_API_KEY: 'key',
        ASSISTANT_BASE_URL: 'https://api.deepseek.com',
        ASSISTANT_MODEL: 'deepseek-chat',
      }),
    ).toBeNull();
  });

  it('reads an explicit host and model', () => {
    const config = readAssistantConfig({
      ASSISTANT_API_KEY: 'key',
      ASSISTANT_BASE_URL: 'https://api.deepseek.com',
      ASSISTANT_MODEL: 'deepseek-chat',
    });
    expect(config).toMatchObject({
      provider: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      dailyLimit: 40,
    });
  });
});

describe('chatCompletionsUrl', () => {
  it('appends the chat path when the base URL is a host', () => {
    expect(chatCompletionsUrl('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    expect(chatCompletionsUrl('https://api.moonshot.ai/v1/')).toBe(
      'https://api.moonshot.ai/v1/chat/completions',
    );
  });
});
