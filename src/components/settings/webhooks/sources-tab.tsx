'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Code,
  Copy,
  FolderDown,
  GitBranch,
  Loader2,
  Plus,
  Trash2,
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
import { RequireRole } from '@/components/auth/require-role';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import type { ApiWebhookSource } from '@/lib/webhooks/sources';

interface PipelineOption {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export function SourcesTab() {
  const [sources, setSources] = useState<ApiWebhookSource[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');

  // Code modal
  const [selectedForCode, setSelectedForCode] =
    useState<ApiWebhookSource | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const [resSources, pipelinesRes, stagesRes] = await Promise.all([
        fetch('/api/account/webhook-sources').then((r) => r.json()),
        supabase.from('pipelines').select('id, name').order('name'),
        supabase
          .from('pipeline_stages')
          .select('id, name, pipeline_id, position')
          .order('position'),
      ]);

      if (resSources?.sources) {
        setSources(resSources.sources);
      }
      if (pipelinesRes.data) {
        const stagesByPipeline = new Map<string, { id: string; name: string }[]>();
        for (const stage of stagesRes.data || []) {
          if (!stagesByPipeline.has(stage.pipeline_id)) {
            stagesByPipeline.set(stage.pipeline_id, []);
          }
          stagesByPipeline.get(stage.pipeline_id)!.push({
            id: stage.id,
            name: stage.name,
          });
        }

        const formattedPipelines: PipelineOption[] = pipelinesRes.data.map((p) => ({
          id: p.id,
          name: p.name,
          stages: stagesByPipeline.get(p.id) || [],
        }));
        setPipelines(formattedPipelines);
      }
    } catch {
      toast.error('Erro ao carregar fontes de webhook');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Informe um nome para a fonte de webhook');
      return;
    }
    try {
      setCreating(true);
      const res = await fetch('/api/account/webhook-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          pipeline_id: pipelineId || undefined,
          stage_id: stageId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar fonte');
      }

      toast.success('Fonte de webhook criada com sucesso!');
      setCreateOpen(false);
      setName('');
      setPipelineId('');
      setStageId('');
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar fonte');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/account/webhook-sources/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Erro ao excluir fonte');
      }
      toast.success('Fonte removida');
      void loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Erro ao excluir fonte'
      );
    }
  };

  const getWebhookUrl = (token: string) => {
    const base =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://seudominio.com';
    return `${base}/api/v1/webhooks/incoming/${token}`;
  };

  const copyUrl = (token: string) => {
    const url = getWebhookUrl(token);
    void navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success('URL do webhook copiada!');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getExampleCode = (source: ApiWebhookSource) => {
    const url = getWebhookUrl(source.token);
    return `<!-- Formulário de Exemplo de Captura para ${source.name} -->
<form id="wacrm-form" onsubmit="sendLead(event)">
  <input type="text" name="name" placeholder="Seu Nome Completo" required />
  <input type="tel" name="phone" placeholder="(11) 99999-9999" required />
  <input type="email" name="email" placeholder="seuemail@exemplo.com" />
  <button type="submit">Quero Receber</button>
</form>

<script>
async function sendLead(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.name.value,
    phone: form.phone.value,
    email: form.email.value
  };

  try {
    const res = await fetch("${url}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert("Enviado com sucesso! Entraremos em contato.");
      form.reset();
    } else {
      alert("Erro no envio. Tente novamente.");
    }
  } catch (err) {
    alert("Erro de conexão.");
  }
}
</script>`;
  };

  const copyCode = (source: ApiWebhookSource) => {
    void navigator.clipboard.writeText(getExampleCode(source));
    setCopiedCode(true);
    toast.success('Código copiado para a área de transferência!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const selectedPipelineStages =
    pipelines.find((p) => p.id === pipelineId)?.stages || [];

  const selectedPipelineLabel =
    pipelineId && pipelineId !== 'none'
      ? pipelines.find((p) => p.id === pipelineId)?.name ||
        'Selecione o funil...'
      : 'Apenas criar contato (sem pipeline)';

  const selectedStageLabel =
    stageId && stageId !== 'default'
      ? selectedPipelineStages.find((st) => st.id === stageId)?.name ||
        'Primeira etapa do funil (padrão)'
      : 'Primeira etapa do funil (padrão)';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">
            Fontes de Recepção (Inbound Webhooks)
          </h3>
          <p className="text-sm text-muted-foreground">
            Gere links únicos para receber contatos de Landing Pages, WordPress,
            Elementor ou Facebook Ads diretamente nos seus funis.
          </p>
        </div>
        <RequireRole min="admin">
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Criar fonte
          </Button>
        </RequireRole>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          icon={FolderDown}
          title="Nenhuma fonte cadastrada"
          description="Crie sua primeira fonte de webhook para receber leads automaticamente no CRM."
          action={
            <RequireRole min="admin">
              <Button onClick={() => setCreateOpen(true)} className="mt-2">
                Criar primeira fonte
              </Button>
            </RequireRole>
          }
        />
      ) : (
        <div className="grid gap-4">
          {sources.map((source) => (
            <Card key={source.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {source.name}
                      </span>
                      <Badge variant={source.is_active ? 'default' : 'secondary'}>
                        {source.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      {source.pipeline_id ? (
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                        >
                          <GitBranch className="h-3 w-3" />
                          <span>
                            {pipelines.find((p) => p.id === source.pipeline_id)?.name || 'Funil'}
                          </span>
                          <span className="text-primary/60">→</span>
                          <span>
                            {source.stage_id
                              ? pipelines
                                  .find((p) => p.id === source.pipeline_id)
                                  ?.stages.find((s) => s.id === source.stage_id)?.name || 'Primeira etapa'
                              : 'Primeira etapa'}
                          </span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Apenas contato (sem funil)
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Última recepção:{' '}
                      {source.last_received_at
                        ? new Date(source.last_received_at).toLocaleString('pt-BR')
                        : 'Nunca recebeu contatos'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedForCode(source)}
                      className="gap-1.5"
                    >
                      <Code className="h-4 w-4" /> Código HTML/JS
                    </Button>
                    <RequireRole min="admin">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => void handleDelete(source.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </RequireRole>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-md bg-muted p-2">
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    {getWebhookUrl(source.token)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => copyUrl(source.token)}
                  >
                    {copiedToken === source.token ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copiar URL
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog para Criar Fonte */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Fonte de Webhook</DialogTitle>
            <DialogDescription>
              Crie uma URL de entrada exclusiva para receber leads externos no
              seu funil.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="source-name">Nome da Fonte</Label>
              <Input
                id="source-name"
                placeholder="Ex: Landing Page E-book"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pipeline">Pipeline (Funil de destino)</Label>
              <Select
                value={pipelineId || 'none'}
                onValueChange={(val) => {
                  if (!val || val === 'none') {
                    setPipelineId('');
                    setStageId('');
                  } else {
                    setPipelineId(val);
                    setStageId('');
                  }
                }}
              >
                <SelectTrigger id="pipeline" className="w-full bg-background">
                  <SelectValue placeholder="Selecione o funil de destino...">
                    {selectedPipelineLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Apenas criar contato (sem pipeline)</SelectItem>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pipelineId && (
              <div className="space-y-2">
                <Label htmlFor="stage">Estágio (ou etapa) do funil</Label>
                <Select
                  value={stageId || 'default'}
                  onValueChange={(val) => {
                    setStageId(!val || val === 'default' ? '' : val);
                  }}
                >
                  <SelectTrigger id="stage" className="w-full bg-background">
                    <SelectValue placeholder="Primeira etapa do funil (padrão)">
                      {selectedStageLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Primeira etapa do funil (padrão)</SelectItem>
                    {selectedPipelineStages.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...
                </>
              ) : (
                'Criar Fonte'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Código HTML/JS */}
      <Dialog
        open={!!selectedForCode}
        onOpenChange={(op) => !op && setSelectedForCode(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modelo de Formulário HTML & Javascript</DialogTitle>
            <DialogDescription>
              Copie o exemplo abaixo e cole na sua landing page para integrar
              diretamente com {selectedForCode?.name}.
            </DialogDescription>
          </DialogHeader>

          {selectedForCode && (
            <div className="space-y-4">
              <div className="relative rounded-md bg-muted p-4">
                <pre className="max-h-80 overflow-x-auto text-xs font-mono text-foreground">
                  <code>{getExampleCode(selectedForCode)}</code>
                </pre>
              </div>
            </div>
          )}

          <DialogFooter>
            {selectedForCode && (
              <Button
                onClick={() => copyCode(selectedForCode)}
                className="gap-2"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copiar Código
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
