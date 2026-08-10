'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bot, RotateCcw, Send, Loader2, UserCircle2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';

interface AiAgentOption {
  id: string;
  name?: string;
  is_active: boolean;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** assistant-only: the agent signalled a human handoff on this turn. */
  handoff?: boolean;
}

export function AiPlayground({ onGoToSetup }: { onGoToSetup?: () => void }) {
  const t = useTranslations('Settings.aiPlayground');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [agents, setAgents] = useState<AiAgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/ai/config')
      .then((r) => r.json())
      .then((data) => {
        if (!active || !data?.agents || !Array.isArray(data.agents)) return;
        setAgents(data.agents);
        const storedId =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('wacrm_ai_selected_agent_id')
            : null;
        const matched = data.agents.find((a: AiAgentOption) => a.id === storedId);
        const activeAgent = data.agents.find((a: AiAgentOption) => a.is_active);
        const initial = matched ? matched.id : activeAgent ? activeAgent.id : data.agents[0]?.id || null;
        setSelectedAgentId(initial);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleSelectVersion = (id: string | null) => {
    if (!id) return;
    setSelectedAgentId(id);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('wacrm_ai_selected_agent_id', id);
      } catch {}
    }
    const agent = agents.find((a) => a.id === id);
    if (agent) {
      toast.success(`Playground testando versão: ${agent.name || 'Agente'}`);
    }
  };

  const selectedAgentObj = agents.find((a) => a.id === selectedAgentId);
  const selectedAgentLabel = selectedAgentObj
    ? `${selectedAgentObj.is_active ? '🟢 [Publicado] ' : '⚪ [Rascunho] '}${selectedAgentObj.name || 'Agente'}`
    : 'Versão Ativa';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((t) => ({ role: t.role, content: t.content })),
          agent_id: selectedAgentId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'ai_not_configured') {
          toast.error(t('notConfigured'));
        } else {
          toast.error(data.error ?? t('couldNotReply'));
        }
        setTurns(turns);
        setInput(text);
        return;
      }
      setTurns([
        ...next,
        {
          role: 'assistant',
          content:
            typeof data.reply === 'string' && data.reply.trim()
              ? data.reply
              : '',
          handoff: Boolean(data.handoff),
        },
      ]);
    } catch {
      toast.error(t('couldNotReach'));
      setTurns(turns);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-[60vh] min-h-[420px] flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Playground</span>
          <span className="text-xs text-muted-foreground">
            {t('subtitle')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {agents.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Testar Versão:</span>
              <Select
                value={selectedAgentId || undefined}
                onValueChange={handleSelectVersion}
                disabled={sending}
              >
                <SelectTrigger className="h-8 w-[230px] text-xs">
                  <SelectValue>{selectedAgentLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.is_active ? '🟢 [Publicado] ' : '⚪ [Rascunho] '}
                      {a.name || 'Agente'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTurns([])}
            disabled={turns.length === 0 || sending}
            className="text-muted-foreground"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t('reset')}
          </Button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <Bot className="mb-2 h-8 w-8 text-muted-foreground/60" />
            <p>{t('emptyNotice')}</p>
            <p className="mt-1 text-xs">
              {t('emptyNoticeHint')}
            </p>
            {onGoToSetup && (
              <Button
                variant="link"
                size="sm"
                onClick={onGoToSetup}
                className="mt-1 h-auto p-0 text-xs"
              >
                {t('notSetUp')} <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {turns.map((tTurn, i) => (
          <div
            key={i}
            className={cn(
              'flex gap-2',
              tTurn.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            {tTurn.role === 'assistant' && (
              <Bot className="mt-1 h-5 w-5 shrink-0 text-primary" />
            )}
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                tTurn.role === 'user'
                  ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : 'rounded-bl-sm bg-muted text-foreground',
              )}
            >
              {tTurn.content && <p className="whitespace-pre-wrap">{tTurn.content}</p>}
              {tTurn.role === 'assistant' && tTurn.handoff && (
                <p
                  className={cn(
                    'flex items-center gap-1 text-xs text-amber-500',
                    tTurn.content && 'mt-1.5 border-t border-border/50 pt-1.5',
                  )}
                >
                  <UserCircle2 className="h-3.5 w-3.5" />
                  {t('handoffBadge')}
                </p>
              )}
            </div>
            {tTurn.role === 'user' && (
              <UserCircle2 className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-5 w-5 text-primary" />
            <Loader2 className="h-4 w-4 animate-spin" /> {t('thinking')}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
        />
        <Button
          size="sm"
          onClick={send}
          disabled={!input.trim() || sending}
          className="h-9 w-9 shrink-0 p-0"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
