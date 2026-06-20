# Redesenho da página /competencias — Fechamento Contábil

Reformular a matriz cliente × mês para refletir o trabalho contábil real: 3 tarefas mensais visíveis por célula (Lançamento, Conc. Bancária, Conc. Contábil), ciclo de fechamento + revisão por período (mensal/trimestral/semestral/anual/livre) como faixa horizontal, totais por linha/coluna, mês corrente destacado, ações em lote e fluxo "Fechar período" como ação central.

## Entrega em 10 PRs incrementais

Cada PR é mergeável sozinho. Confirmação entre PRs antes de seguir.

### PR 1 — Legibilidade base (modelagem + sentence case)
- Migration: `clients.apelido text`, `clients.cadencia_fechamento text default 'mensal'`.
- Coluna empresa na matriz: mantém razão social completa, apenas convertida de caixa alta para sentence case/title case; tooltip com razão social formatada; largura ~220px, peso 500, 12px.
- Header em sentence case ("Fechamento contábil 2025"); subtítulo curto.
- Nota: apelido fica disponível no banco para uso futuro, mas a exibição padrão usa o nome completo.

### PR 2 — Células com 3 mini-barras
- Novo `CellTriBar`: grid 3 colunas × altura total, gap 1px, ~26×22px.
- Posições fixas: Lançamento | Conc. Banc. | Conc. Cont., cor por status (5 cores semânticas via tokens HSL).
- Substitui os códigos CC/CB/AD/L atuais. Hover/click mantêm comportamento antigo nesta etapa.
- Legenda compacta sempre visível abaixo dos KPIs.

### PR 3 — Totais, mês corrente, hover row
- Coluna "Total" à direita (% meses 100% concluídos + mini-barra 3px).
- Linha "% conciliado por mês" embaixo, colorida por urgência (verde >80%, amarelo 50–80%, vermelho <50%, info para mês corrente, cinza futuros).
- Mês corrente: fundo `rgba(61,90,128,0.06)` e header em peso 500.
- Hover row highlight; cliente encerrado tachado + listrado nos meses pós-fim.

### PR 4 — Tooltip estruturado + drawer de detalhe
- Tooltip por célula (delay 400ms) com 3 linhas: tipo · status · quem/quando.
- Click → drawer lateral: status por tipo, comentários, pendências relacionadas, ações (marcar concluído, criar pendência, reatribuir).

### PR 5 — Cadência + view `v_closing_periods`
- Migration: `review_submissions.periodo_inicio date`, `periodo_fim date` (coexistem com `competencia`).
- View `v_closing_periods` gera períodos esperados por cadência e calcula `periodo_status` (aprovado | em_revisao | pronto | em_andamento | nao_iniciado).
- Ainda sem UI; apenas dados consumíveis.

### PR 6 — Faixa de fechamento + banner + sub-linha
- Faixa horizontal 5px abaixo das células, contínua ao longo dos meses do mesmo período (teal pronto / amarelo em revisão / verde aprovado).
- Sub-linha na coluna empresa: "fech. trimestral · Q1/25 aprovado" etc.
- Banner teal no rodapé com período pronto + CTA "Fechar período".
- KPI "Períodos prontos p/ fechar" substitui ou complementa "finalizadas".

### PR 7 — Modal "Fechar período" + integração com revisão
- Seleção de range (pré-preenchido pela cadência; date pickers se `livre`).
- Validação: todos meses do range com Lanç + Conc.Banc + Conc.Cont = completed. Mensagem clara do que falta.
- Upload de demonstrativos conforme tributação (reaproveita `LiberarRevisaoDialog`).
- Seleção de analista revisora (carga atual visível, default menos sobrecarregada).
- Cria `review_submission` com `periodo_inicio`/`periodo_fim`; faixa passa de teal para amarelo.

### PR 8 — Bulk selection
- Checkbox por linha; barra navy ao selecionar 1+.
- Ações: "Marcar [tipo] concluído em [mês]" (modal escolhe tipo+mês), "Reatribuir responsável".

### PR 9 — Toggle "Matriz anual" / "Foco no mês"
- Visão alternativa por competência: tabela Empresa | Lançamento | Conc.Banc. | Conc.Cont. | Responsável | Prazo.
- Ordenação por prazo (default), filtros "só pendentes"/"só atrasados".

### PR 10 — Mobile (<768px)
- KPIs em scroll horizontal; header/filtros empilhados.
- Default mobile = "Foco no mês"; mês corrente pré-selecionado.
- Tooltip → click → drawer.

## Detalhes técnicos

**Modelagem**
- `clients.apelido text null`, `clients.cadencia_fechamento text default 'mensal' check in ('mensal','trimestral','semestral','anual','livre')`.
- `review_submissions.periodo_inicio date`, `periodo_fim date` (nullable inicialmente; preenchidos pelo novo fluxo).
- `v_closing_periods(client_id, periodo_label, periodo_inicio, periodo_fim, status)` derivando de `clients.cadencia_fechamento`, `demand_status_entries` e `review_submissions`.
- Sem mudanças destrutivas; `competencia` mantida em `review_submissions` para compatibilidade.

**UI / tokens**
- Todas cores via tokens HSL em `index.css` (success/warning/danger/info + teal de marca `#5B9EA6`).
- Nada hardcoded em componentes.
- Componentes novos: `CellTriBar`, `ClosingBandRow`, `PeriodReadyBanner`, `FecharPeriodoDialog`, `BulkActionBarMatrix`, `MonthFocusView`.

**Sem regressão**
- Filtros persistidos (`use-persisted-filter`), exportação Excel e permissões mantidos em todos os PRs.

## Próximo passo

Próximo passo: PR 3 — Totais, mês corrente, hover row.
