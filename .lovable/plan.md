# Painel gerencial — Plano de implementação

Nova área `/controle-gerencial` para a reunião semanal de liderança: backlog consolidado, velocity, projeção (ETA), aderência ao planejamento, heatmap cliente × competência e briefing semanal com fluxo de revisão/aprovação antes do envio.

Fatiamento entregue em **9 PRs** sequenciais. Cada PR é independente e deployável.

---

## PR 1 — Modelagem e permissões

**Tabelas novas:**
- `backlog_snapshots` (snapshot semanal versionado por indicador × unidade × tributação, único em `(snapshot_date, indicador, unidade, tributacao)`)
- `gestao_metas` (metas configuráveis — usado só no PR 9)
- `briefing_drafts` (rascunho semanal com workflow `em_revisao → aprovado → enviado/arquivado`, único em `iso_week`)

**Índices em `demand_status_entries`:**
- `(status, year, month)`
- `(filled_by, status) WHERE status = 'completed'`

**RLS:**
- SELECT em todas: quem tem `ver_painel_gerencial`
- `briefing_drafts` UPDATE: `revisar_briefing_semanal` e só quando `status = 'em_revisao'`
- `gestao_metas` mutação: `configurar_metas`
- INSERT em `backlog_snapshots`/`briefing_drafts`: service_role apenas

**`settings.action_permissions` — chaves novas:**
- `ver_painel_gerencial` (default: coordenacao, admin)
- `revisar_briefing_semanal` (default: coordenacao)
- `configurar_metas` (default: admin)

**`settings` — chave nova:**
- `painel_gerencial_recipients` (array de e-mails)

**Storage bucket:** `briefing-pptx` (privado).

---

## PR 2 — Edge function `generate-backlog-snapshot`

Cron pg_cron toda segunda 06:00 America/Sao_Paulo + botão "Atualizar agora" (`force=true`).

**Indicadores calculados** (cada um × unidade × tributação + total):
- `lancamentos_pendentes`, `conciliacao_bancaria_pendente`, `conciliacao_contabil_pendente`, `fechamento_mensal_pendente` — count distinct (cliente, ano, mês) em `demand_status_entries` com status ≠ completed, respeitando `clients.competencia_inicio`
- `fechamento_anual_pendente` — count distinct cliente com algum mês do ano corrente não fechado
- `revisao_pendente` — `review_submissions` em `aguardando`/`em_revisao`
- `velocity_*` por tipo — entries movidos para completed nos últimos 7 dias

Idempotente via UPSERT. `detalhes` jsonb guarda top 10 clientes/competências para o drill-down.

---

## PR 3 — Página `/controle-gerencial` (versão básica)

Rota nova em `App.tsx`, registrada em `src/lib/permissions.ts` com guard `ver_painel_gerencial`. Item no sidebar condicional.

**Layout:**
- Header: título, subtítulo com semana corrente + timestamp do snapshot, botão "Atualizar agora", filtros Unidade e Tributação
- **Bloco 1 — 6 KPIs** (grid 3×2): número grande, delta vs semana anterior (verde/vermelho/—), sparkline 8 sem (Recharts), click abre drawer (stub no PR 4)
- **Bloco 2 — Burndown** (LineChart, últimas 12 semanas, linha por tipo, linha tracejada de meta se houver)
- **Bloco 3 — Velocity + ETA**: bar chart 8 semanas por tipo; lista ETA (`backlog/velocity` com semáforo verde/amarelo/vermelho; aviso "Backlog crescendo — capacidade insuficiente" quando entrada > saída)

Skeletons em cada bloco. Tokens HSL navy/teal. Número em peso 500 32px.

---

## PR 4 — Drill-down e rankings

- Drawer (`Sheet`) ao clicar em qualquer KPI: breakdown por unidade/tributação, lista de items agrupados por cliente, filtros (idade, responsável), botão "Exportar Excel" (xlsx), link para `/competencias` filtrado
- **Bloco 6 — Rankings** (3 listas lado a lado): top 10 clientes com mais backlog, top 5 competências mais atrasadas, top 5 colaboradores com fila mais antiga

---

## PR 5 — Heatmap cliente × competência

- **Bloco 5** com `<div>` grid (sem libs)
- Linhas: top 30 clientes mais pendentes; Colunas: últimas 12 competências
- Cor: verde / amarelo (1-2 tipos) / laranja (3+) / vermelho (todos + atrasado)
- Hover com tooltip detalhado; click → `/competencias` filtrado
- Cache TanStack Query 1h
- Mobile: vira lista vertical com cor agregada

---

## PR 6 — Aderência ao planejamento

- **Bloco 4**: planejado vs concluído na semana corrente (a partir de `plannings` com prazo dentro da semana), % aderência, barra de progresso, mini-tabela de atrasos, link para `/planejamento` filtrado
- Snapshot da aderência adicionado ao job semanal

---

## PR 7 — Briefing semanal (geração + revisão, sem envio)

**Edge function `generate-weekly-briefing`** (cron segunda 06:05, após snapshot):
1. Recalcula deltas vs semana anterior
2. Infere alertas automáticos por regras: backlog crescendo 4 semanas seguidas → crítico; aderência caiu >5pp → atenção; cliente com 3+ meses atrasados → atenção
3. Gera PPTX 10 slides com **pptxgenjs no servidor**, paleta navy/teal
4. Salva em Storage `briefing-pptx/{iso_week}.pptx`
5. Cria `briefing_drafts` com `status='em_revisao'`
6. Notificação in-app para `revisar_briefing_semanal`

**Tela `/controle-gerencial/briefing/:isoWeek`** (duas colunas):
- Esquerda: textarea resumo executivo, editor de lista de alertas (severity/title/detail, add/remove/reorder), editor de prioridades da próxima semana, notas internas (não vão pro PPTX)
- Direita: preview do PPTX (thumbnails), botão "Regenerar PPTX", "Baixar PPTX"
- Rodapé: Salvar rascunho · Aprovar e enviar (stub no PR 8) · Aprovar sem enviar · Arquivar
- Read-only após aprovação

---

## PR 8 — Envio e histórico do briefing

**Edge function `send-briefing-email`** (chamada só pelo botão "Aprovar e enviar"):
- Lê `painel_gerencial_recipients`
- E-mail com resumo + alertas + link, PPTX em anexo (via Lovable email infra — `email_domain--setup_email_infra` + template app email; verificar se anexos cabem ou usar signed URL do Storage como fallback)
- Atualiza status → `enviado`, grava `sent_by`, `sent_at`, `recipients_snapshot`

**Lembretes** (cron diário):
- Rascunho > 24h sem revisão → notifica liderança
- Rascunho > 72h → escala para admin

**Página `/controle-gerencial/briefings`:**
- Lista últimos 12 briefings (semana, status, revisor, envio, destinatários)
- Filtro por status, métrica "taxa de aprovação no prazo" (aprovados antes de quarta / total)
- Click abre em modo read-only

---

## PR 9 — Metas (v2)

- Tela `/configuracoes` → aba Metas: CRUD em `gestao_metas` por indicador, unidade opcional, valor, tipo (máximo/mínimo), vigência
- Linhas tracejadas nos gráficos; badge "fora da meta" nos KPIs

---

## Notas técnicas

- **Stack**: React 18 + Vite + Tailwind + shadcn + Recharts + TanStack Query + Lovable Cloud (Supabase). PPTX via `pptxgenjs` em edge function Deno.
- **Performance**: backlog atual em tempo real (com índices novos); tendências sempre via `backlog_snapshots`; heatmap top-30 cacheado 1h; drill-down lazy.
- **Anexo de e-mail**: a infra de e-mail Lovable não suporta anexos hoje. Plano: enviar **link assinado do Storage** no corpo do e-mail em vez de anexar o PPTX. Confirmar com você antes do PR 8.
- **Sidebar**: novo item "Controle gerencial" condicional à permissão.
- **Mobile**: heatmap colapsa em lista; rankings empilham; KPIs viram 2×3.

Confirma para começar pelo PR 1?
