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
