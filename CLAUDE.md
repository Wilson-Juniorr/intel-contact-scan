# Intel Contact Scan — CRM de Planos de Saúde

## Visão Geral
CRM para corretoras de planos de saúde no Brasil. Comunicação nativa via WhatsApp (UaZapi), agentes IA para qualificação e vendas, funil completo de lead até implantação.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite 5.4 |
| Styling | Tailwind CSS 3.4 + shadcn/ui (Radix UI) |
| State | TanStack React Query 5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Animações | Framer Motion |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Edge Functions | Deno runtime |
| WhatsApp | UaZapi (REST API) |
| IA | Google Gemini 2.5 Flash Lite (transcrição + geração) |
| Auth | Supabase Auth (email/password) |
| Deploy | Lovable + Supabase Cloud |

## Estrutura de Diretórios

```
src/
├── components/
│   ├── agents/       # UI de configuração e playground dos agentes
│   ├── closing/      # Componentes da engine de fechamento
│   ├── dashboard/    # Cards, gráficos, métricas
│   ├── followup/     # UI de follow-up
│   ├── funnel/       # Kanban do funil (FunnelColumn, FunnelCard)
│   ├── layout/       # Sidebar, header, navigation
│   ├── leads/        # CRUD de leads, importação
│   ├── onboarding/   # Fluxo de onboarding
│   ├── settings/     # Configurações do usuário
│   ├── today/        # Painel "Hoje" com tarefas
│   ├── ui/           # shadcn/ui components
│   └── whatsapp/     # Chat, bubbles, conversation list
├── contexts/         # React contexts (auth, theme)
├── hooks/            # Custom hooks
├── integrations/     # Supabase client e types
├── lib/              # Utilities
├── pages/            # Route pages
└── types/            # TypeScript types

supabase/
├── functions/
│   ├── _shared/              # automation-gate, compliance-guardian, opt-out
│   ├── junior-sdr/           # Agente pré-qualificador (principal)
│   ├── sdr-qualificador/     # Shim de compatibilidade → junior-sdr
│   ├── route-message/        # Router de mensagens inbound
│   ├── route-lead/           # Router de leads
│   ├── follow-up-message/    # Geração de follow-up com LLM
│   ├── execute-follow-up-queue/ # Executor da fila de follow-ups
│   ├── junior-followup/      # Follow-up automático do SDR
│   ├── closing-engine/       # Sequência de fechamento (4 steps)
│   ├── rewarming-enroll/     # Inscrição em reaquecimento
│   ├── rewarming-execute/    # Execução de reaquecimento
│   ├── send-whatsapp/        # Envio de mensagens via UaZapi
│   ├── whatsapp-webhook/     # Receptor de webhooks UaZapi
│   ├── agent-call/           # Invocação genérica de agentes
│   ├── next-best-action/     # Sugestão de próxima ação
│   ├── lead-summary/         # Resumo IA do lead
│   ├── update-lead-memory/   # Atualiza memória persistente do lead
│   ├── classify-conversation/ # Classificação de conversa
│   ├── rewrite-message/      # Reescrita de mensagem com IA
│   ├── suggest-tasks/        # Sugestão de tarefas
│   └── ...
└── migrations/               # 48 migrations PostgreSQL
```

## Comandos

```bash
npm run dev          # Dev server (Vite)
npm run build        # Build produção
npm run test         # Vitest
npm run lint         # ESLint
supabase start       # Supabase local
supabase functions serve  # Edge Functions local
supabase db push     # Aplicar migrations
```

## Padrões de Código

### Edge Functions (Deno)
- Import via `https://esm.sh/` (não npm)
- CORS headers em todas as respostas
- `Deno.serve()` para funções novas, `serve()` de std para legadas
- Supabase client com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` para funções internas
- UaZapi: `UAZAPI_URL` + `UAZAPI_TOKEN` via env
- Normalizar telefone: sempre com DDI 55 (Brasil)

### Agentes IA
- Slug canônico em `agent_slug` (ex: "junior-sdr")
- Estado da conversa em `agent_conversations.conversation_state`
- Memória durável em `lead_memory.structured_json`
- Few-shot dinâmico via tabela `agent_examples`
- Brains (perfis de vendedor) via tabela `agent_brains`
- Técnicas de venda via tabela `agent_techniques`
- Áudios pré-gravados via tabela `agent_audios`
- Compliance: janela de horário + content guardian + opt-out detection

### Frontend
- Componentes em PascalCase, hooks em camelCase com prefixo `use`
- shadcn/ui para todos os componentes base
- React Query para data fetching (queries + mutations)
- Zod para validação de forms
- Sonner para toasts
- Lucide para ícones
- Idioma: pt-BR em toda UI

## Banco de Dados (tabelas principais)

- `leads` — leads com stage, type, operator, lives, phone
- `whatsapp_messages` — histórico de mensagens (direction: inbound/outbound)
- `agent_conversations` — conversas ativas dos agentes (status, mensagens, state)
- `lead_memory` — memória IA por lead (summary + structured_json)
- `follow_up_queue` — fila de follow-ups agendados
- `closing_sequences` / `closing_steps` — sequências de fechamento
- `agent_audios` — áudios pré-gravados por trigger
- `agent_examples` — few-shot examples por agente
- `agent_brains` — perfis/personas de vendedor
- `agent_techniques` — técnicas de venda
- `action_log` — log de ações por lead
- `organizations` / `organization_members` — multi-tenant

## Funil de Vendas (stages)

novo → tentativa_contato → contato_realizado → cotacao_enviada → cotacao_aprovada → documentacao_completa → em_emissao → aguardando_implantacao → implantado

Stages terminais: declinado, cancelado, retrabalho

## Convenções

- Commits em português ou inglês, mensagem descritiva
- Branch naming: `feature/`, `fix/`, `refactor/`
- Nunca commitar .env ou secrets
- Preferir editar arquivos existentes a criar novos
- Manter compatibilidade com funções legadas (shims quando necessário)
- Testes com Vitest + Testing Library
