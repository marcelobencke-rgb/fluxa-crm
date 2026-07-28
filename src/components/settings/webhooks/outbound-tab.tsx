'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Copy,
  Loader2,
  Plus,
  Trash2,
  Webhook,
  AlertTriangle,
  Check,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RequireRole } from '@/components/auth/require-role';
import type { ApiWebhookEndpoint } from '@/lib/webhooks/endpoints';

const AVAILABLE_EVENTS = [
  { id: 'lead.created', label: 'Contato / Lead criado' },
  { id: 'message.received', label: 'Mensagem recebida' },
  { id: 'message.sent', label: 'Mensagem enviada' },
  { id: 'conversation.created', label: 'Conversa criada' },
];

export function OutboundTab() {
  const [endpoints, setEndpoints] = useState<ApiWebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'lead.created',
    'message.received',
  ]);

  // One-time secret reveal
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const loadEndpoints = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/account/webhook-endpoints');
      const data = await res.json();
      if (data?.endpoints) {
        setEndpoints(data.endpoints);
      }
    } catch {
      toast.error('Erro ao carregar webhooks de saída');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEndpoints();
  }, [loadEndpoints]);

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((e) => e !== eventId)
        : [...prev, eventId]
    );
  };

  const handleCreate = async () => {
    if (!url.trim() || !url.startsWith('https://')) {
      toast.error('Informe uma URL válida iniciada com https://');
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error('Selecione ao menos um evento de disparo');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/account/webhook-endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          events: selectedEvents,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao cadastrar webhook');
      }

      setRevealedSecret(data.endpoint.secret || null);
      toast.success('Webhook de saída cadastrado com sucesso!');
      setUrl('');
      setSelectedEvents(['lead.created', 'message.received']);
      void loadEndpoints();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Erro ao cadastrar webhook'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/account/webhook-endpoints/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Erro ao excluir webhook');
      }
      toast.success('Webhook removido');
      void loadEndpoints();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Erro ao excluir webhook'
      );
    }
  };

  const copySecret = () => {
    if (revealedSecret) {
      void navigator.clipboard.writeText(revealedSecret);
      setCopiedSecret(true);
      toast.success('Segredo copiado!');
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">
            Webhooks de Saída (Outbound Webhooks)
          </h3>
          <p className="text-sm text-muted-foreground">
            Envie notificações em tempo real para sistemas externos (n8n,
            Zapier, Make, ERP) sempre que ocorrerem eventos no seu CRM.
          </p>
        </div>
        <RequireRole min="admin">
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Cadastrar webhook
          </Button>
        </RequireRole>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : endpoints.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Nenhum webhook de saída cadastrado"
          description="Cadastre um endpoint HTTPS para receber notificações de mensagens, contatos ou conversas."
          action={
            <RequireRole min="admin">
              <Button onClick={() => setCreateOpen(true)} className="mt-2">
                Cadastrar primeiro webhook
              </Button>
            </RequireRole>
          }
        />
      ) : (
        <div className="grid gap-4">
          {endpoints.map((ep) => (
            <Card key={ep.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {ep.url}
                      </span>
                      <Badge
                        variant={ep.is_active ? 'default' : 'destructive'}
                      >
                        {ep.is_active ? 'Ativo' : 'Desativado'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {ep.events.map((ev) => (
                        <Badge
                          key={ev}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {ev}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <RequireRole min="admin">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => void handleDelete(ep.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </RequireRole>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                  <span>
                    Último disparo:{' '}
                    {ep.last_delivery_at
                      ? new Date(ep.last_delivery_at).toLocaleString('pt-BR')
                      : 'Nunca disparado'}
                  </span>
                  {ep.failure_count > 0 && (
                    <span className="text-amber-500 font-medium">
                      Falhas consecutivas: {ep.failure_count}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Criação */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Webhook de Saída</DialogTitle>
            <DialogDescription>
              Cadastre um endereço HTTPS do seu sistema externo para ser
              notificado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="url">URL do Endpoint HTTPS</Label>
              <Input
                id="url"
                placeholder="https://seu-servidor.com/webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Eventos inscritos</Label>
              <div className="space-y-2 rounded-md border p-3">
                {AVAILABLE_EVENTS.map((ev) => (
                  <label
                    key={ev.id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedEvents.includes(ev.id)}
                      onCheckedChange={() => toggleEvent(ev.id)}
                    />
                    <span>{ev.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ...
                </>
              ) : (
                'Cadastrar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Segredo Único */}
      <Dialog
        open={!!revealedSecret}
        onOpenChange={(op) => !op && setRevealedSecret(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Segredo de
              Assinatura HMAC
            </DialogTitle>
            <DialogDescription>
              Guarde este segredo agora! Ele é exibido apenas{' '}
              <strong>uma única vez</strong> por segurança para autenticação do{' '}
              <code>X-Wacrm-Signature</code>.
            </DialogDescription>
          </DialogHeader>

          {revealedSecret && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 rounded-md bg-muted p-2 font-mono text-xs break-all">
                <span className="flex-1">{revealedSecret}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-1.5"
                  onClick={copySecret}
                >
                  {copiedSecret ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-500" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copiar
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setRevealedSecret(null);
                setCreateOpen(false);
              }}
            >
              Entendido e Salvo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
