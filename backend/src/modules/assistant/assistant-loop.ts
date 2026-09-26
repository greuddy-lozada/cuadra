import type { AssistantToolDef, AssistantTurn } from './provider';
import type { AssistantProvider } from './provider';
import { ASSISTANT_FALLBACK } from './assistant.prompt';

const MAX_ROUNDS = 4;

export async function runAssistantLoop(input: {
  provider: AssistantProvider;
  execute: (name: string, args: unknown) => Promise<unknown>;
  system: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  tools: AssistantToolDef[];
  maxRounds?: number;
}): Promise<{ text: string; reportId: string | null }> {
  const turns: AssistantTurn[] = input.history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
  const rounds = input.maxRounds ?? MAX_ROUNDS;
  let reportId: string | null = null;

  for (let round = 0; round < rounds; round += 1) {
    const completion = await input.provider.complete({
      system: input.system,
      messages: turns,
      tools: input.tools,
    });

    if (completion.kind === 'message') {
      const text = completion.text.trim();
      return { text: text || ASSISTANT_FALLBACK, reportId };
    }

    turns.push({
      role: 'assistant',
      content: '',
      toolCalls: completion.calls.map((call) => ({
        id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments ?? {}),
      })),
    });

    for (const call of completion.calls) {
      const result = await input.execute(call.name, call.arguments);
      const found = readReportId(result);
      if (found) reportId = found;
      turns.push({
        role: 'tool',
        toolCallId: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { text: ASSISTANT_FALLBACK, reportId };
}

function readReportId(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('reportId' in result)) {
    return null;
  }
  const id = (result as { reportId?: unknown }).reportId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
