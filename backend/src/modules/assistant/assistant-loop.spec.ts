import type { AssistantProvider } from './provider';
import { ASSISTANT_TOOLS } from './assistant-tools';
import { runAssistantLoop } from './assistant-loop';
import { ASSISTANT_FALLBACK } from './assistant.prompt';

describe('runAssistantLoop', () => {
  it('runs a tool and returns the report id from a fake provider', async () => {
    const provider: AssistantProvider = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          kind: 'tool_calls',
          calls: [
            {
              id: 'call-1',
              name: 'generate_report',
              arguments: { type: 'fiscal_iva' },
            },
          ],
        })
        .mockResolvedValueOnce({ kind: 'message', text: 'Listo el IVA.' }),
    };
    const execute = jest.fn().mockResolvedValue({ reportId: 'report-1' });

    const result = await runAssistantLoop({
      provider,
      execute,
      system: 'sys',
      history: [{ role: 'user', content: 'IVA de este mes' }],
      tools: ASSISTANT_TOOLS,
    });

    expect(result).toEqual({ text: 'Listo el IVA.', reportId: 'report-1' });
    expect(execute).toHaveBeenCalledWith('generate_report', {
      type: 'fiscal_iva',
    });
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it('stops after the round cap', async () => {
    const provider: AssistantProvider = {
      complete: jest.fn().mockResolvedValue({
        kind: 'tool_calls',
        calls: [{ id: 'call-1', name: 'get_today_snapshot', arguments: {} }],
      }),
    };
    const execute = jest.fn().mockResolvedValue({ todaySalesCount: 1 });

    const result = await runAssistantLoop({
      provider,
      execute,
      system: 'sys',
      history: [{ role: 'user', content: 'hoy' }],
      tools: ASSISTANT_TOOLS,
      maxRounds: 4,
    });

    expect(provider.complete).toHaveBeenCalledTimes(4);
    expect(result.reportId).toBeNull();
    expect(result.text).toBe(ASSISTANT_FALLBACK);
  });
});
