'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  Trash2,
  Eye,
  EyeOff,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';
import { AiKnowledgeCard } from './ai-knowledge';
import { AI_PROVIDER_DEFAULT_MODEL } from '@/lib/ai/defaults';
import type { AiProvider } from '@/lib/ai/types';
import type { AccountMember } from '@/types';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import { useTranslations } from 'next-intl';

const MASKED_KEY = '••••••••••••••••';

// Radix Select can't use an empty-string item value, so the "leave
// unassigned" choice gets a sentinel that maps to null in the payload.
const HANDOFF_QUEUE = '__queue__';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

const KEY_PLACEHOLDER: Record<AiProvider, string> = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
};

const MODEL_OPTIONS: Record<
  AiProvider,
  { value: string; label: string; desc?: string }[]
> = {
  openai: [
    {
      value: 'gpt-4o-mini',
      label: 'gpt-4o-mini (Recomendado)',
      desc: 'Mais rápido, excelente para WhatsApp e de baixo custo',
    },
    {
      value: 'gpt-4o',
      label: 'gpt-4o',
      desc: 'Mais inteligente para raciocínio complexo',
    },
    {
      value: 'gpt-4-turbo',
      label: 'gpt-4-turbo',
      desc: 'Modelo Turbo avançado',
    },
    {
      value: 'gpt-3.5-turbo',
      label: 'gpt-3.5-turbo',
      desc: 'Modelo clássico super veloz',
    },
  ],
  anthropic: [
    {
      value: 'claude-3-5-haiku-20241022',
      label: 'claude-3-5-haiku (Recomendado)',
      desc: 'Rápido e econômico para chats',
    },
    {
      value: 'claude-3-5-sonnet-20241022',
      label: 'claude-3-5-sonnet',
      desc: 'Respostas extremamente precisas e detalhadas',
    },
  ],
};

interface AiPromptGuideProps {
  onInsertSnippet: (snippet: string) => void;
  disabled?: boolean;
}

function AiPromptGuide({ onInsertSnippet, disabled }: AiPromptGuideProps) {
  const [open, setOpen] = useState(false);

  const snippets = [
    {
      title: '🏷️ Transferência para Humano ([[HANDOFF]])',
      description:
        'Ensina a IA a transferir o atendimento para a equipe humana quando o cliente quiser agendar, remarcar ou falar com uma pessoa.',
      code: `### REGRA DE TRANSFERÊNCIA (HANDOFF)
Sempre que o cliente solicitar agendamento, consulta ou pedir para falar com um humano:
1. Responda educadamente informando que vai chamar um especialista da equipe.
2. Obrigatoriamente adicione a tag [[HANDOFF]] no final da sua mensagem.`,
    },
    {
      title: '⚡ Avanço Automático no Funil (update_deal_stage)',
      description:
        'A IA movimenta o card do cliente em tempo real no seu Kanban do Funil (CRM) conforme a conversa evolui.',
      code: `### REGRA DE AVANÇO NO FUNIL
Nosso funil se chama "Comercial" e tem as etapas: "Novo Lead", "Qualificado", "Agendamento Solicitado" e "Venda Fechada".
- Se o cliente demonstrar interesse real, chame a ferramenta update_deal_stage movendo para "Qualificado".
- Se pedir para agendar, chame update_deal_stage movendo para "Agendamento Solicitado" antes de executar o [[HANDOFF]].`,
    },
    {
      title: '🔒 Proteção de Preços e Prazos',
      description:
        'Impede a IA de inventar preços ou promoções que não constem na sua Base de Conhecimento.',
      code: `### REGRA DE SEGURANÇA E VALORES
Você NÃO inventa preços, prazos ou promoções. Baseie-se apenas nos documentos da Base de Conhecimento. Se o cliente perguntar sobre condições personalizadas, transfira para um humano usando [[HANDOFF]].`,
    },
  ];

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 mt-3 transition-all">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left font-medium text-foreground hover:opacity-80 transition-opacity"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Lightbulb className="h-4 w-4" />
          Guia de Comandos e Automações da IA (Handoff & Avanço de Funil)
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="mt-3.5 space-y-3.5 text-sm border-t border-primary/10 pt-3">
          <p className="text-xs text-muted-foreground">
            Abaixo estão as ferramentas e tags que a IA do CRM é capaz de executar nativamente. Você pode copiar ou clicar em <strong>&quot;Inserir no prompt&quot;</strong> para adicionar o modelo à sua caixa de texto acima.
          </p>

          <div className="space-y-3">
            {snippets.map((s, idx) => (
              <div
                key={idx}
                className="rounded-md border border-border/80 bg-card p-3 shadow-sm space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-semibold text-foreground text-xs">{s.title}</h4>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        navigator.clipboard.writeText(s.code);
                        toast.success('Exemplo copiado para a área de transferência!');
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copiar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs px-2"
                      disabled={disabled}
                      onClick={() => {
                        onInsertSnippet(s.code);
                        toast.success('Regra inserida com sucesso no seu Prompt!');
                      }}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Inserir no prompt
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{s.description}</p>
                <pre className="overflow-x-auto rounded bg-muted/60 p-2.5 text-[11px] font-mono text-foreground/90 border border-border/40 whitespace-pre-wrap">
                  {s.code}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type GuardrailKind =
  | 'regex_output_block'
  | 'rag_must_hit'
  | 'regex_input_block'
  | 'window_check'
  | 'contact_flag';

interface GuardrailItem {
  kind: GuardrailKind;
  reason: string;
  pattern?: string;
  flags?: string;
  min_citations?: number;
  start_hour?: number;
  end_hour?: number;
  timezone?: string;
  field?: string;
  expected?: boolean;
}

const GUARDRAIL_KIND_LABELS: Record<GuardrailKind, string> = {
  regex_output_block: 'Bloqueio de saída por Regex',
  rag_must_hit: 'Exigir citação da Base (RAG)',
  regex_input_block: 'Bloqueio de entrada por Regex',
  window_check: 'Janela horária de atendimento',
  contact_flag: 'Restrição por flag de contato',
};

function defaultGuardrailForKind(kind: GuardrailKind): GuardrailItem {
  switch (kind) {
    case 'regex_output_block':
      return {
        kind: 'regex_output_block',
        pattern: '',
        flags: 'i',
        reason: 'Bloquear conteúdo sensível na resposta',
      };
    case 'rag_must_hit':
      return {
        kind: 'rag_must_hit',
        min_citations: 1,
        reason: 'Exigir citação da base',
      };
    case 'regex_input_block':
      return {
        kind: 'regex_input_block',
        pattern: '',
        flags: 'i',
        reason: 'Bloquear input com termo proibido',
      };
    case 'window_check':
      return {
        kind: 'window_check',
        start_hour: 7,
        end_hour: 22,
        timezone: 'America/Sao_Paulo',
        reason: 'Janela operacional 7h-22h',
      };
    case 'contact_flag':
      return {
        kind: 'contact_flag',
        field: 'force_human',
        expected: false,
        reason: 'Skip se contato pediu humano',
      };
  }
}

function isGuardrailInvalid(item: GuardrailItem): boolean {
  if (
    item.kind === 'regex_output_block' ||
    item.kind === 'regex_input_block'
  ) {
    if (!item.pattern || !item.pattern.trim()) return true;
    try {
      new RegExp(item.pattern, item.flags || 'i');
    } catch {
      return true;
    }
  }
  return false;
}

function GuardrailFields({
  item,
  onPatch,
  disabled,
}: {
  item: GuardrailItem;
  onPatch: (p: Partial<GuardrailItem>) => void;
  disabled?: boolean;
}) {
  const reasonField = (
    <div className="space-y-1">
      <Label className="text-xs">Motivo</Label>
      <Input
        value={item.reason}
        onChange={(e) => onPatch({ reason: e.target.value })}
        disabled={disabled}
        className="h-8 text-xs"
      />
    </div>
  );

  if (item.kind === 'regex_output_block' || item.kind === 'regex_input_block') {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Pattern (regex)</Label>
          <Input
            value={item.pattern ?? ''}
            onChange={(e) => onPatch({ pattern: e.target.value })}
            disabled={disabled}
            className="font-mono h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Flags</Label>
          <Input
            value={item.flags ?? 'i'}
            onChange={(e) => onPatch({ flags: e.target.value })}
            disabled={disabled}
            className="font-mono h-8 text-xs"
          />
        </div>
        <div className="md:col-span-3">{reasonField}</div>
      </div>
    );
  }

  if (item.kind === 'rag_must_hit') {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Citações mínimas</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={item.min_citations ?? 1}
            onChange={(e) =>
              onPatch({
                min_citations: Number(e.target.value) || 1,
              })
            }
            disabled={disabled}
            className="h-8 text-xs"
          />
        </div>
        <div className="md:col-span-2">{reasonField}</div>
      </div>
    );
  }

  if (item.kind === 'window_check') {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Hora início (0–23)</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={item.start_hour ?? 7}
            onChange={(e) => onPatch({ start_hour: Number(e.target.value) })}
            disabled={disabled}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hora fim (0–23)</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={item.end_hour ?? 22}
            onChange={(e) => onPatch({ end_hour: Number(e.target.value) })}
            disabled={disabled}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Timezone</Label>
          <Input
            value={item.timezone ?? 'America/Sao_Paulo'}
            onChange={(e) => onPatch({ timezone: e.target.value })}
            disabled={disabled}
            className="h-8 text-xs"
          />
        </div>
        <div className="md:col-span-4">{reasonField}</div>
      </div>
    );
  }

  // contact_flag
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="space-y-1">
        <Label className="text-xs">Campo</Label>
        <Select
          value={item.field ?? 'force_human'}
          onValueChange={(v) => onPatch({ field: v || undefined })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="force_human">force_human</SelectItem>
            <SelectItem value="is_blocked">is_blocked</SelectItem>
            <SelectItem value="is_vip">is_vip</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 pt-6">
        <Switch
          checked={item.expected ?? false}
          onCheckedChange={(v) => onPatch({ expected: v })}
          disabled={disabled}
        />
        <Label className="text-xs">
          Valor esperado: {item.expected ? 'true' : 'false'}
        </Label>
      </div>
      <div className="md:col-span-3">{reasonField}</div>
    </div>
  );
}

interface AiAdvancedParamsCardProps {
  temperature: number;
  setTemperature: (v: number) => void;
  maxTokens: number;
  setMaxTokens: (v: number) => void;
  contextWindow: number;
  setContextWindow: (v: number) => void;
  ragTopK: number;
  setRagTopK: (v: number) => void;
  similarityThreshold: number;
  setSimilarityThreshold: (v: number) => void;
  confidenceThreshold: number;
  setConfidenceThreshold: (v: number) => void;
  guardrails: GuardrailItem[];
  setGuardrails: React.Dispatch<React.SetStateAction<GuardrailItem[]>>;
  disabled?: boolean;
}

function AiAdvancedParamsCard({
  temperature,
  setTemperature,
  maxTokens,
  setMaxTokens,
  contextWindow,
  setContextWindow,
  ragTopK,
  setRagTopK,
  similarityThreshold,
  setSimilarityThreshold,
  confidenceThreshold,
  setConfidenceThreshold,
  guardrails,
  setGuardrails,
  disabled,
}: AiAdvancedParamsCardProps) {
  const [pendingKind, setPendingKind] =
    useState<GuardrailKind>('window_check');

  function updateGuardrail(idx: number, patch: Partial<GuardrailItem>) {
    setGuardrails((prev) =>
      prev.map((it, i) =>
        i === idx ? ({ ...it, ...patch } as GuardrailItem) : it,
      ),
    );
  }

  function removeGuardrail(idx: number) {
    setGuardrails((prev) => prev.filter((_, i) => i !== idx));
    toast.success('Guardrail removido');
  }

  function addGuardrail() {
    setGuardrails((prev) => [...prev, defaultGuardrailForKind(pendingKind)]);
    toast.success('Novo guardrail adicionado! Configure os campos abaixo.');
  }

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Parâmetros Avançados do Agente (Modelo, RAG e Guardrails)
        </CardTitle>
        <CardDescription>
          Ajuste fino da criatividade, precisão de busca semântica na Base de
          Conhecimento e regras de segurança.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* MODELO (LLM KNOBS) */}
        <div className="space-y-3 rounded-lg border border-border/70 bg-card p-4">
          <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
            🧠 Parâmetros do Modelo (LLM Knobs)
          </h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Temperature (0–2)</Label>
              <Input
                type="number"
                step="0.05"
                min={0}
                max={2}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                disabled={disabled}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Controla a criatividade. Padrão 0,3 = respostas precisas e fiéis
                à empresa.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Max tokens (64–4096)
              </Label>
              <Input
                type="number"
                step="64"
                min={64}
                max={4096}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                disabled={disabled}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Tamanho máximo em tokens de cada resposta gerada (1024 ≈ 750
                palavras).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Janela de contexto (msgs, 1–50)
              </Label>
              <Input
                type="number"
                step="1"
                min={1}
                max={50}
                value={contextWindow}
                onChange={(e) => setContextWindow(Number(e.target.value))}
                disabled={disabled}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Memória do bot: quantas mensagens anteriores da conversa ele
                analisa para responder.
              </p>
            </div>
          </div>
        </div>

        {/* PARÂMETROS RAG */}
        <div className="space-y-3 rounded-lg border border-border/70 bg-card p-4">
          <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
            📚 Parâmetros de Busca na Base de Conhecimento (RAG)
          </h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Top K (1–20)</Label>
              <Input
                type="number"
                step="1"
                min={1}
                max={20}
                value={ragTopK}
                onChange={(e) => setRagTopK(Number(e.target.value))}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Similarity threshold (0–1)
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Confidence threshold (0–1)
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground rounded bg-muted/40 p-2 border border-border/30">
            <strong>Top K</strong> = quantos trechos buscar. <strong>Similarity threshold</strong> = mínimo de relevância (cosine) para
            considerar o trecho. <strong>Confidence</strong> = limiar de certeza
            abaixo do qual o agent escala automaticamente para humano.
          </p>
        </div>

        {/* GUARDRAILS - EDITOR DINÂMICO */}
        <div className="space-y-4 rounded-lg border border-border/70 bg-card p-4">
          <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
            <span>🛡️ Guardrails & Regras de Conformidade</span>
            <span className="text-xs font-normal text-muted-foreground">
              Ative proteções e defina as condições específicas abaixo
            </span>
          </h4>

          {/* Adicionar novo guardrail */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Tipo do novo guardrail</Label>
              <Select
                value={pendingKind}
                onValueChange={(v) => setPendingKind(v as GuardrailKind)}
                disabled={disabled}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue>{GUARDRAIL_KIND_LABELS[pendingKind]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GUARDRAIL_KIND_LABELS) as GuardrailKind[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {GUARDRAIL_KIND_LABELS[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={addGuardrail}
              disabled={disabled}
              className="bg-emerald-700 hover:bg-emerald-800 text-white h-9 text-xs font-medium px-4"
            >
              Adicionar guardrail
            </Button>
          </div>

          {guardrails.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum guardrail definido. O agente responde sem restrições adicionais.
            </p>
          ) : (
            <ul className="space-y-3">
              {guardrails.map((item, idx) => {
                const invalid = isGuardrailInvalid(item);
                return (
                  <li
                    key={idx}
                    className={`rounded-md border p-3.5 bg-muted/10 transition-colors ${
                      invalid ? 'border-destructive/60 bg-destructive/5' : 'border-border/60'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-foreground">
                        {GUARDRAIL_KIND_LABELS[item.kind]}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeGuardrail(idx)}
                        disabled={disabled}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remover
                      </Button>
                    </div>
                    <GuardrailFields
                      item={item}
                      onPatch={(p) => updateGuardrail(idx, p)}
                      disabled={disabled}
                    />
                    {invalid && (
                      <p className="mt-2 text-xs font-medium text-destructive">
                        Campos inválidos. Ajuste antes de salvar.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AiConfig() {
  const { accountId, accountRole, profileLoading } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const t = useTranslations('Settings.aiConfig');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState(AI_PROVIDER_DEFAULT_MODEL.openai);
  const [apiKey, setApiKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [embeddingsKey, setEmbeddingsKey] = useState('');
  const [embeddingsKeyEdited, setEmbeddingsKeyEdited] = useState(false);
  const [hasStoredEmbeddingsKey, setHasStoredEmbeddingsKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [maxPerConversation, setMaxPerConversation] = useState(3);
  // Empty string = leave unassigned (shared queue).
  const [handoffAgentId, setHandoffAgentId] = useState('');
  const [members, setMembers] = useState<AccountMember[]>([]);

  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [contextWindow, setContextWindow] = useState(20);
  const [ragTopK, setRagTopK] = useState(5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.72);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.55);
  const [guardrails, setGuardrails] = useState<GuardrailItem[]>([
    {
      kind: 'window_check',
      start_hour: 7,
      end_hour: 22,
      timezone: 'America/Sao_Paulo',
      reason: 'Janela operacional 7h-22h',
    },
    {
      kind: 'rag_must_hit',
      min_citations: 1,
      reason: 'Exigir citação da base',
    },
  ]);

  const handleInsertSnippet = useCallback((snippet: string) => {
    setSystemPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      return `${trimmed}\n\n${snippet}`;
    });
  }, []);

  // Guard keyed on the account (not a bare boolean) so an in-place
  // account switch — ownership transfer, multi-account membership —
  // refetches instead of showing the previous account's config. Mirrors
  // the loadedAccountIdRef pattern in whatsapp-config.tsx.
  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('loadFailed'));
        return;
      }
      if (data.configured) {
        setConfigured(true);
        setProvider(data.provider);
        setModel(data.model);
        setSystemPrompt(data.system_prompt ?? '');
        setIsActive(data.is_active);
        setAutoReplyEnabled(data.auto_reply_enabled);
        setMaxPerConversation(data.auto_reply_max_per_conversation ?? 3);
        setHandoffAgentId(data.handoff_agent_id ?? '');
        setHasStoredKey(Boolean(data.has_key));
        setApiKey(data.has_key ? MASKED_KEY : '');
        setKeyEdited(false);
        setHasStoredEmbeddingsKey(Boolean(data.has_embeddings_key));
        setEmbeddingsKey(data.has_embeddings_key ? MASKED_KEY : '');
        setEmbeddingsKeyEdited(false);
        if (data.config && typeof data.config === 'object') {
          if (data.config.temperature !== undefined) setTemperature(data.config.temperature);
          if (data.config.max_tokens !== undefined) setMaxTokens(data.config.max_tokens);
          if (data.config.context_message_window !== undefined) setContextWindow(data.config.context_message_window);
          if (data.config.rag_top_k !== undefined) setRagTopK(data.config.rag_top_k);
          if (data.config.rag_similarity_threshold !== undefined) setSimilarityThreshold(data.config.rag_similarity_threshold);
          if (data.config.confidence_threshold !== undefined) setConfidenceThreshold(data.config.confidence_threshold);
          if (Array.isArray(data.config.guardrails)) setGuardrails(data.config.guardrails);
        }
      }
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchConfig();
    // Members populate the handoff-target picker. Best-effort — on an
    // older deployment without the endpoint the picker just shows the
    // queue option.
    void fetchAccountMembers().then(setMembers);
  }, [accountId, fetchConfig]);

  // Swap the model default when the provider changes, unless the user
  // typed a custom model.
  const handleProviderChange = (next: AiProvider) => {
    setProvider(next);
    const isDefaultModel =
      model === AI_PROVIDER_DEFAULT_MODEL.openai ||
      model === AI_PROVIDER_DEFAULT_MODEL.anthropic ||
      model.trim() === '';
    if (isDefaultModel) setModel(AI_PROVIDER_DEFAULT_MODEL[next]);
  };

  const keyPayload = () => (keyEdited ? apiKey.trim() : undefined);

  // undefined = leave unchanged; '' typed = null (clear); text = set.
  const embeddingsKeyPayload = () =>
    embeddingsKeyEdited ? embeddingsKey.trim() || null : undefined;

  const buildBody = () => ({
    provider,
    model: model.trim(),
    api_key: keyPayload(),
    embeddings_api_key: embeddingsKeyPayload(),
    system_prompt: systemPrompt.trim() || null,
    is_active: isActive,
    auto_reply_enabled: autoReplyEnabled,
    auto_reply_max_per_conversation: maxPerConversation,
    handoff_agent_id: handoffAgentId || null,
    config: {
      temperature,
      max_tokens: maxTokens,
      context_message_window: contextWindow,
      rag_top_k: ragTopK,
      rag_similarity_threshold: similarityThreshold,
      confidence_threshold: confidenceThreshold,
      guardrails,
    },
  });

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: model.trim(),
          api_key: keyPayload(),
        }),
      });
      const data = await res.json();
      if (res.ok) toast.success(t('testSuccess'));
      else toast.error(data.error ?? t('testRejected'));
    } catch {
      toast.error(t('testNetworkError'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!model.trim()) {
      toast.error(t('missingModel'));
      return;
    }
    if (!configured && !keyEdited) {
      toast.error(t('missingApiKey'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('saveSuccess'));
        await fetchConfig();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch('/api/ai/config', { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setConfigured(false);
        setHasStoredKey(false);
        setApiKey('');
        setKeyEdited(false);
        setIsActive(false);
        setAutoReplyEnabled(false);
        setSystemPrompt('');
        setHandoffAgentId('');
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
    } finally {
      setRemoving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
      </div>
    );
  }

  const disabled = !canEdit || saving;

  const selectedHandoffMember = members.find(
    (m) => m.user_id === handoffAgentId
  );
  const handoffLabel =
    !handoffAgentId || handoffAgentId === HANDOFF_QUEUE
      ? t('handoffQueue')
      : selectedHandoffMember
        ? memberLabel(selectedHandoffMember)
        : t('handoffQueue');

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      {!canEdit && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('adminOnlyConfig')}
        </p>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> {t('providerAndKey')}
            </CardTitle>
            <CardDescription>
              {t('encryptionNotice')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('provider')}</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => handleProviderChange(v as AiProvider)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">{PROVIDER_LABEL.openai}</SelectItem>
                    <SelectItem value="anthropic">
                      {PROVIDER_LABEL.anthropic}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-model">{t('model')}</Label>
                <Select
                  value={model}
                  onValueChange={(v) => setModel(v || AI_PROVIDER_DEFAULT_MODEL[provider])}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={AI_PROVIDER_DEFAULT_MODEL[provider]} />
                  </SelectTrigger>
                  <SelectContent>
                    {(MODEL_OPTIONS[provider] ?? []).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{opt.label}</span>
                          {opt.desc && (
                            <span className="text-xs text-muted-foreground">{opt.desc}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                    {model && !(MODEL_OPTIONS[provider] ?? []).some((o) => o.value === model) && (
                      <SelectItem value={model}>
                        <span className="font-medium">{model}</span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-key">{t('apiKey')}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="ai-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyEdited(true);
                    }}
                    onFocus={() => {
                      if (!keyEdited && hasStoredKey) {
                        setApiKey('');
                        setKeyEdited(true);
                      }
                    }}
                    placeholder={KEY_PLACEHOLDER[provider]}
                    disabled={disabled}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={disabled || testing}
                >
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {t('testKey')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-embeddings-key">
                {t('embeddingsKey')}{' '}
                <span className="font-normal text-muted-foreground">
                  {t('optionalSemanticSearch')}
                </span>
              </Label>
              <Input
                id="ai-embeddings-key"
                type="password"
                value={embeddingsKey}
                onChange={(e) => {
                  setEmbeddingsKey(e.target.value);
                  setEmbeddingsKeyEdited(true);
                }}
                onFocus={() => {
                  if (!embeddingsKeyEdited && hasStoredEmbeddingsKey) {
                    setEmbeddingsKey('');
                    setEmbeddingsKeyEdited(true);
                  }
                }}
                placeholder="sk-... (OpenAI)"
                disabled={disabled}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t('embeddingsHint', {
                  sameKeyText: provider === 'openai' ? t('sameKeyText') : '',
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('behaviour')}</CardTitle>
            <CardDescription>
              {t('behaviourDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">{t('businessContext')}</Label>
              <Textarea
                id="ai-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t('promptPlaceholder')}
                rows={5}
                disabled={disabled}
              />
              <AiPromptGuide onInsertSnippet={handleInsertSnippet} disabled={disabled} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('enableAssistant')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('enableAssistantDesc')}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('autoReply')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('autoReplyDesc')}
                </p>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
                disabled={disabled || !isActive}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ai-max">{t('maxAutoReplies')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('maxAutoRepliesDesc')}
                </p>
              </div>
              <Input
                id="ai-max"
                type="number"
                min={1}
                max={100}
                value={maxPerConversation}
                onChange={(e) =>
                  setMaxPerConversation(
                    Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                disabled={disabled || !autoReplyEnabled}
                className="w-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-handoff">{t('handoffTo')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('handoffToDesc')}
              </p>
              <Select
                value={handoffAgentId || HANDOFF_QUEUE}
                onValueChange={(v) =>
                  setHandoffAgentId(!v || v === HANDOFF_QUEUE ? '' : v)
                }
                disabled={disabled || !autoReplyEnabled}
              >
                <SelectTrigger id="ai-handoff">
                  <SelectValue>{handoffLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HANDOFF_QUEUE}>
                    {t('handoffQueue')}
                  </SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <AiKnowledgeCard
          accountId={accountId}
          canEdit={canEdit}
          hasEmbeddingsKey={
            embeddingsKeyEdited
              ? embeddingsKey.trim().length > 0
              : hasStoredEmbeddingsKey
          }
        />

        <AiAdvancedParamsCard
          temperature={temperature}
          setTemperature={setTemperature}
          maxTokens={maxTokens}
          setMaxTokens={setMaxTokens}
          contextWindow={contextWindow}
          setContextWindow={setContextWindow}
          ragTopK={ragTopK}
          setRagTopK={setRagTopK}
          similarityThreshold={similarityThreshold}
          setSimilarityThreshold={setSimilarityThreshold}
          confidenceThreshold={confidenceThreshold}
          setConfidenceThreshold={setConfidenceThreshold}
          guardrails={guardrails}
          setGuardrails={setGuardrails}
          disabled={disabled}
        />

        <div className="flex items-center justify-between">
          {configured ? (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={!canEdit || removing}
              className="text-destructive hover:text-destructive"
            >
              {removing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('remove')}
            </Button>
          ) : (
            <span />
          )}

          <Button onClick={handleSave} disabled={disabled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
