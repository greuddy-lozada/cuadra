export interface AssistantToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export type AssistantTurn =
  | { role: 'user' | 'assistant'; content: string }
  | {
      role: 'assistant';
      content: '';
      toolCalls: { id: string; name: string; arguments: string }[];
    }
  | { role: 'tool'; toolCallId: string; content: string };

export interface AssistantUsage {
  inputTokens: number;
  outputTokens: number;
}

export type AssistantCompletion =
  | { kind: 'message'; text: string; usage?: AssistantUsage }
  | { kind: 'tool_calls'; calls: AssistantToolCall[]; usage?: AssistantUsage };

export interface AssistantProvider {
  complete(input: {
    system: string;
    messages: AssistantTurn[];
    tools: AssistantToolDef[];
  }): Promise<AssistantCompletion>;
}

export const ASSISTANT_PROVIDER = 'ASSISTANT_PROVIDER';
