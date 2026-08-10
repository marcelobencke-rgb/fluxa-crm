<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Padrões de Layout e Componentes de UI do Projeto

1. **Seletores e Dropdowns (Componente Padrão `<Select>`)**:
   - Nunca utilizar tags nativas `<select>` ou `<option>` do HTML.
   - Usar sempre os componentes Shadcn UI em `@/components/ui/select` (`<Select>`, `<SelectTrigger>`, `<SelectValue>`, `<SelectContent>`, `<SelectItem>`).
   - **REGRA CRÍTICA PARA `<SelectValue>` (base-ui/radix)**: Quando o Select estiver fechado, para evitar que o `<SelectValue>` exiba o ID bruto (UUID ou valor em string), você **DEVE** passar o texto legível (`label`) como *children* de `<SelectValue>`. Exemplo obrigatório:
     ```tsx
     const selectedLabel = items.find((i) => i.id === value)?.name || "Selecione...";
     // ...
     <SelectValue placeholder="Selecione...">{selectedLabel}</SelectValue>
     ```

2. **Padrão de Layout para Listagens (Badges & Indicadores de Funil)**:
   - Em telas de listagem (como Webhook Sources, Automações, Configurações), os itens devem ser exibidos em cartões padronizados (`<Card>`, `<CardContent>`).
   - Para exibição de relacionamentos com Pipeline (Funil) e Estágio (Etapa), utilizar o formato visual de fluxo com badge secundário, ícone `GitBranch` e seta explicativa:
     ```tsx
     <Badge variant="secondary" className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
       <GitBranch className="h-3 w-3" />
       <span>{pipelineName}</span>
       <span className="text-primary/60">→</span>
       <span>{stageName}</span>
     </Badge>
     ```
   - Garantir suporte completo a Dark Mode em todas as listagens, modais e seletores.

## Padrões de Performance e Carregamento (Novo)

Para evitar os gargalos de lentidão resolvidos anteriormente, TODOS os novos desenvolvimentos devem seguir obrigatoriamente estas regras:

1. **Evite `useEffect` com fetches duplicados**: 
   - Se os dados forem compartilhados entre múltiplos componentes montados simultaneamente (ex: Tags, WhatsApp Config, Perfil), **não faça** fetch manual via `useEffect`. 
   - Utilize a infraestrutura de hooks em cache em `src/hooks/use-cached-query.ts`. Crie um hook customizado (ex: `useTags()`) para injetar esse cache, limitando o consumo de rede e eliminando duplicação de requests.

2. **Lazy Loading para Múltiplas Abas/Painéis**: 
   - Ao construir páginas estilo "Dashboard" ou "Configurações" que contêm múltiplas abas, nunca instancie todos os sub-painéis no render principal.
   - Utilize obrigatoriamente `React.lazy()` e `<Suspense>` para importar sob demanda apenas o painel atualmente ativo na URL/Estado. Ex: `const ProfilePanel = lazy(() => import('./profile-panel').then(m => ({ default: m.ProfilePanel })))`.

3. **Dynamic Imports para Bibliotecas Pesadas**:
   - Para telas complexas que importam bibliotecas gigantes (como Gráficos em `@/components/tremor/` ou fluxogramas como `@xyflow/react`), injete esses componentes na página pai via `next/dynamic` com `{ ssr: false }`. Isso tira a carga do bundle inicial da página.

4. **WebSockets (Realtime) Otimizados**:
   - Evite injetar múltiplos canais do Supabase Realtime escutando a mesma tabela em diferentes componentes da UI.
   - Sempre que precisar assinar eventos globais (ex: Mensagens Não Lidas, Notificações), use e expanda o contexto global existente (`src/hooks/use-global-realtime.tsx`). Nunca instancie hooks com `supabase.channel` separadamente em *child components*.
