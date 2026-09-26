import { Logger } from '@nestjs/common';
import type {
  AssistantCompletion,
  AssistantProvider,
  AssistantToolCall,
  AssistantToolDef,
  AssistantTurn,
  AssistantUsage,
} from './provider';
import type { AssistantRuntimeConfig } from './assistant.config';
import { chatCompletionsUrl, providerHost } from './assistant.config';

interface WireMessage {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

export class OpenAiCompatibleProvider implements AssistantProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  private readonly host: string;
  private readonly url: string;

  constructor(private readonly config: AssistantRuntimeConfig) {
    this.host = providerHost(config.baseUrl);
    this.url = chatCompletionsUrl(config.baseUrl);
  }

  async complete(input: {
    system: string;
    messages: AssistantTurn[];
    tools: AssistantToolDef[];
  }): Promise<AssistantCompletion> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: input.system },
          ...input.messages.map(toWire),
        ],
        tools: input.tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      this.logger.error(
        `assistant provider status=${response.status} host=${this.host} model=${this.config.model}`,
      );
      throw new Error('ASSISTANT_PROVIDER_HTTP');
    }

    const json = (await response.json()) as {
      choices?: { message?: WireMessage }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const usage = readUsage(json.usage);
    this.logger.log(
      `assistant complete host=${this.host} model=${this.config.model} in=${usage?.inputTokens ?? 0} out=${usage?.outputTokens ?? 0}`,
    );

    const message = json.choices?.[0]?.message;
    const calls = (message?.tool_calls ?? [])
      .map(toCall)
      .filter((call): call is AssistantToolCall => call !== null);

    if (calls.length > 0) {
      return { kind: 'tool_calls', calls, usage };
    }

    return { kind: 'message', text: message?.content ?? '', usage };
  }
}

function toWire(turn: AssistantTurn): WireMessage {
  if (turn.role === 'tool') {
    return {
      role: 'tool',
      content: turn.content,
      tool_call_id: turn.toolCallId,
    };
  }
  if ('toolCalls' in turn) {
    return {
      role: 'assistant',
      content: null,
      tool_calls: turn.toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: turn.role, content: turn.content };
}

function toCall(raw: {
  id?: string;
  function?: { name?: string; arguments?: unknown };
}): AssistantToolCall | null {
  const name = raw.function?.name;
  if (!raw.id || !name) return null;
  return {
    id: raw.id,
    name,
    arguments: parseArgs(raw.function?.arguments),
  };
}

function parseArgs(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function readUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
}): AssistantUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
  };
}
