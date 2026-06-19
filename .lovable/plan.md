# Redesenho /pendencias — painel denso e acionável

Sem mudança no modelo de dados. Apenas UI + 1 função SQL derivada de criticidade + ajustes em edge functions já existentes para suportar lote.

Vou entregar fatiado em 8 PRs. Cada PR é independente e seguro de revisar. Aprove e eu começo pelo PR 1 (maior ganho visual, menor risco). A cada PR concluído, pauso para você validar antes do próximo.

---

## PR 1 — Cards densos + sentence case + ações reduzidas

Refatora `PendencyCard` para um layout horizontal compacto (~80px de altura, 5+ por tela).

- Cliente em sentence case, 13px peso 500, ellipsis após 40 chars
- Competência vira pílula azul mono ao lado do nome
- Prioridade só aparece se ≠ "media"
- Linha meta única: `aberta há Xd · N cobranças (canal/data) · Responsável`
- Se `total_contatos = 0` → "nunca cobrada no sistema" (sem duplicação com "Nunca contatado")
- Ações: 2 botões primários visíveis + menu `⋯` com Pausar / Reatribuir / Link portal / Histórico / Excluir
- Em cards `normal`, ações primárias só aparecem em hover
- Subtítulo do header encurtado para "Painel de cobrança · internas e externas"

## PR 2 — Criticidade derivada + ordenação + borda colorida

Cria a função SQL `pendency_criticality(pendency_id)` retornando enum `critica | urgente | aguardando_resposta | normal` com as regras:

```text
critica   = prazo_resposta < now()
          OR (idade > 14d AND total_contatos = 0)
          OR (ultimo_contato_em < now() - 10d AND total_contatos > 0)
urgente   = next_followup_at <= now()
          OR prazo_resposta < now() + 3d
aguardando = ultimo_contato_em >= now() - 7d
normal    = resto
```

Exposta via view `pendencies_with_criticality` (join leve). Hook `usePendencies` passa a ler dessa view.

- Borda esquerda 3px: vermelho (crítica) / amarelo (urgente / aguardando) / sem (normal)
- Status pill contextual no canto direito: `crítica · Xd sem contato`, `cobrar hoje`, `aguardando resposta · Xd`, `cobrar em Xd`
- Default de ordenação: criticidade desc → idade desc
- Card "aguardando resposta" troca botão primário "Cobrar agora" por "Cobrar novamente"

## PR 3 — KPIs compactos + tabs com contador

- 4 cards em grid horizontal, ~70px de altura, clicáveis (filtram a lista)
- KPI "Vencidas" → substituído por "Críticas" (vermelho se > 0)
- Mantidos: "Abertas", "Sem contato > 7d" (laranja se > 0), "Resolvidas no mês" (verde)
- Tabs ganham contador inline: `Externas · cliente · 5`

## PR 4 — Bulk selection e ações em lote

- Checkbox pequeno no canto esquerdo de cada card
- Barra azul navy aparece quando ≥1 selecionado: `✓ N selecionadas [Cobrar em lote] [Pausar] [Reatribuir] [×]`
- Modal "Cobrar em lote": escolhe canal (e-mail / WhatsApp), aplica template e dispara `registrar_cobranca` para cada pendência (loop individual no client, não bulk insert, para não cair em SPAM)
- Pausar em lote: aplica `followup_paused=true` + data opcional
- Reatribuir em lote: muda `responsavel_id`

## PR 5 — Detecção de inconsistência descrição × log

- Regex `/cobrei|liguei|enviei|mandei|falei|contatei/i` na `descricao`
- Quando match AND `total_contatos = 0` → banner amarelo inline no card com botão "Registrar contato externo"
- Modal pré-preenchido com trecho que disparou o match, canal (e-mail/telefone/WhatsApp/Teams/Digsac/outro), data (hoje editável), resposta recebida (sim/não)
- Lista de palavras-gatilho fica em `settings.key = 'cobranca_keywords'` (editável)

## PR 6 — Integração bidirecional com planejamento

No drawer de detalhe, nova seção "Trabalho relacionado no planejamento":

- Query `plannings` + `demand_status_entries` por `client_id` + `competencia` + `demand_type`
- Cada item é um link que abre `/planejamento` com filtros aplicados
- Texto: "Esta pendência bloqueia 2 conciliações em jan/25 e fev/25"

## PR 7 — Timeline de comunicações

Drawer lateral acessado por `⋯` → "Histórico":

- Lista vertical de `pendency_communications` ordenada desc
- Cada item: data, ícone do canal, autor, resumo da mensagem, resposta se houve
- Estilo "incident timeline" (linha vertical com pontos)

## PR 8 — Mobile (< 768px)

- KPIs com scroll horizontal (swipe)
- Filtros viram bottom sheet (1 botão "Filtros")
- Cards full-width, mesma densidade
- Ações em bottom sheet ao tocar no card
- Long-press ativa modo bulk

---

## Detalhes técnicos

**Arquivos novos**
- `src/components/pendency/PendencyCardCompact.tsx` (PR 1)
- `src/components/pendency/BulkActionBar.tsx` (PR 4)
- `src/components/pendency/BulkCobrarDialog.tsx` (PR 4)
- `src/components/pendency/RegistrarContatoExternoDialog.tsx` (PR 5)
- `src/components/pendency/PendencyTimelineDrawer.tsx` (PR 7)
- `src/components/pendency/RelatedPlanningSection.tsx` (PR 6)
- `src/lib/pendency-criticality.ts` (helper de cor/label — PR 2)

**Migrations**
- PR 2: `CREATE OR REPLACE FUNCTION public.pendency_criticality(...)` + `CREATE OR REPLACE VIEW public.pendencies_with_criticality AS ...` + grants

**Tokens**
- Sem cor hardcoded. Reuso `--destructive`, `--warning`, `--info` já existentes em `index.css`
- Adiciono apenas `--pendency-stripe-*` se necessário

**Sem regressão**
- Modelagem de dados inalterada
- Permissões existentes (`gerenciar_pendencias`, `supervisionar_pendencias`) continuam aplicadas
- `use-persisted-filter` cobre as novas seleções (ordenação, bulk)

---

## Ordem recomendada de aprovação

Sugiro aprovar PR 1 isoladamente primeiro — já entrega ~50% do ganho visual com risco mínimo. PRs 2-4 são o coração da nova UX. PRs 5-8 são refinamentos.

Posso começar pelo PR 1? Ou quer que ajuste algo no plano antes?
