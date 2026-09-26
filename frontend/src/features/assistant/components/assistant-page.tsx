'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { extractApiError } from '@/lib/api/extract-api-error';
import { assistantService } from '../services/assistant.service';
import type { AssistantMessage } from '../services/assistant.service';
import { useAssistantStatus, useSendAssistantMessage } from '../hooks/use-assistant';

const SUGGESTIONS = [
  'assistant.suggestions.today',
  'assistant.suggestions.stock',
  'assistant.suggestions.purchases',
  'assistant.suggestions.iva',
] as const;

export function AssistantPage() {
  const { t } = useI18n();
  const status = useAssistantStatus(true);

  if (status.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  if (!status.data?.enabled) {
    return (
      <Alert>
        <AlertDescription>{t('assistant.unavailable')}</AlertDescription>
      </Alert>
    );
  }

  return <AssistantChat />;
}

function AssistantChat() {
  const { t } = useI18n();
  const send = useSendAssistantMessage();
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingSeq = useRef(0);
  const loadId = useRef(0);

  useEffect(() => {
    const id = loadId.current + 1;
    loadId.current = id;
    let cancelled = false;
    assistantService
      .latest()
      .then((thread) => {
        if (cancelled || id !== loadId.current) return;
        setThreadId(thread?.id);
        setMessages(thread?.messages ?? []);
      })
      .catch(() => {
        if (!cancelled && id === loadId.current) setError(t('assistant.error.send'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, send.isPending]);

  const ask = async (content: string) => {
    const text = content.trim();
    if (!text || send.isPending) return;
    loadId.current += 1;
    setError(null);
    setDraft('');
    const pendingId = `pending-${pendingSeq.current}`;
    pendingSeq.current += 1;
    setMessages((current) => [
      ...current,
      {
        id: pendingId,
        role: 'user',
        content: text,
        reportId: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      const result = await send.mutateAsync({ content: text, threadId });
      setThreadId(result.threadId);
      setMessages((current) => [...current, result.message]);
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      setDraft(text);
      setError(extractApiError(err) ?? t('assistant.error.send'));
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            loadId.current += 1;
            setThreadId(undefined);
            setMessages([]);
            setError(null);
          }}
        >
          {t('assistant.newChat')}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" role="log">
        {messages.length === 0 && !send.isPending && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('assistant.empty')}</p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal text-left"
                  onClick={() => void ask(t(key))}
                >
                  {t(key)}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-8 rounded-2xl bg-primary/10 px-3 py-2 text-sm'
                : 'mr-8 rounded-2xl bg-muted px-3 py-2 text-sm'
            }
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.reportId && (
              <Button asChild variant="link" className="mt-1 h-auto px-0">
                <Link href={`/reports?report=${message.reportId}`}>
                  {t('assistant.viewReport')}
                </Link>
              </Button>
            )}
          </div>
        ))}
        {send.isPending && (
          <p className="text-sm text-muted-foreground">{t('assistant.loading')}</p>
        )}
        <div ref={bottomRef} />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('assistant.placeholder')}
          autoFocus
          disabled={send.isPending}
          maxLength={2000}
        />
        <Button type="submit" disabled={send.isPending || !draft.trim()}>
          {t('assistant.send')}
        </Button>
      </form>
    </div>
  );
}
