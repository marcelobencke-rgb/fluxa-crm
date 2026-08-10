'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Activity, Loader2, RefreshCw } from 'lucide-react';

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
import type { ApiWebhookLog } from '@/lib/webhooks/sources';

export function ActivityTab() {
  const [logs, setLogs] = useState<ApiWebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<ApiWebhookLog | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/account/webhook-logs?limit=50');
      const data = await res.json();
      if (data?.logs) {
        setLogs(data.logs);
      }
    } catch {
      toast.error('Erro ao carregar histórico de atividade de webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">
            Histórico de Atividade (Logs)
          </h3>
          <p className="text-sm text-muted-foreground">
            Acompanhe em tempo real as notificações recebidas e disparadas pelo
            sistema e inspecione os payloads JSON para auditoria.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadLogs()}
          className="gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? 'animate-spin text-muted-foreground' : ''}`}
          />{' '}
          Atualizar
        </Button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nenhum evento registrado"
          description="O histórico de disparos e recebimentos aparecerá aqui assim que o primeiro webhook for processado."
        />
      ) : (
        <div className="grid gap-2">
          {logs.map((log) => (
            <Card
              key={log.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => setSelectedLog(log)}
            >
              <CardContent className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      log.status_code >= 200 && log.status_code < 300
                        ? 'default'
                        : 'destructive'
                    }
                  >
                    {log.status_code}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wider font-mono"
                  >
                    {log.direction === 'inbound' ? 'ENTRADA' : 'SAÍDA'}
                  </Badge>
                  <span className="font-medium text-sm text-foreground">
                    {log.event_type}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString('pt-BR')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Inspecionar JSON */}
      <Dialog
        open={!!selectedLog}
        onOpenChange={(op) => !op && setSelectedLog(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Payload Webhook</DialogTitle>
            <DialogDescription>
              Inspecione o conteúdo JSON completo do evento{' '}
              <code>{selectedLog?.event_type}</code>.
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Status HTTP:</span>
                <Badge
                  variant={
                    selectedLog.status_code >= 200 &&
                    selectedLog.status_code < 300
                      ? 'default'
                      : 'destructive'
                  }
                >
                  {selectedLog.status_code}
                </Badge>
                <span className="text-muted-foreground ml-4">Direção:</span>
                <span className="font-semibold uppercase">
                  {selectedLog.direction}
                </span>
                <span className="text-muted-foreground ml-4">Data/Hora:</span>
                <span>
                  {new Date(selectedLog.created_at).toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="relative rounded-md bg-muted p-4">
                <pre className="max-h-96 overflow-x-auto text-xs font-mono text-foreground">
                  <code>
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </code>
                </pre>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setSelectedLog(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
