import apiClient from '@/lib/api/api-client';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reportId: string | null;
  createdAt: string;
}

export interface AssistantThread {
  id: string;
  messages: AssistantMessage[];
}

export const assistantService = {
  async status(): Promise<{ enabled: boolean }> {
    const response = await apiClient.get('/assistant/status');
    return response.data.data as { enabled: boolean };
  },

  async latest(): Promise<AssistantThread | null> {
    const response = await apiClient.get('/assistant/thread');
    return (response.data.data?.thread ?? null) as AssistantThread | null;
  },

  async send(content: string, threadId?: string): Promise<{
    threadId: string;
    message: AssistantMessage;
  }> {
    const response = await apiClient.post('/assistant/messages', {
      content,
      ...(threadId ? { threadId } : {}),
    });
    return response.data.data as {
      threadId: string;
      message: AssistantMessage;
    };
  },
};
