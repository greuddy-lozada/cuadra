'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { assistantService } from '../services/assistant.service';

export function useAssistantStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: () => assistantService.status(),
    enabled,
    staleTime: 60_000,
  });
}

export function useSendAssistantMessage() {
  return useMutation({
    mutationFn: ({ content, threadId }: { content: string; threadId?: string }) =>
      assistantService.send(content, threadId),
  });
}
